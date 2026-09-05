import {
  CARD_CONDITION,
  DEFECT_SEVERITY,
  DEFECT_TYPE,
  EVIDENCE_PROVENANCE,
  IMAGE_SIDE,
  INTELLIGENCE_CONFIDENCE,
  RESTOCK_LIKELIHOOD,
  RESTOCK_OBSERVATION_TYPE,
  VALUE_EVIDENCE_TYPE,
} from "../constants.js";
import { AUCTION_TAX_MODE, analyzeAuctionIntelligence } from "../auctionIntelligence.js";
import { createCardAnalysisPipeline } from "../analysisPipeline.js";
import { assessCardCondition } from "../conditionAssessment.js";
import { analyzeDealIntelligence } from "../dealIntelligence.js";
import { createMoney } from "../money.js";
import { analyzeRestockIntelligence } from "../restockIntelligence.js";

export const PHASE_1C_QA_CLOCK = "2026-08-25T14:00:00.000Z";

const usd = (minorUnits) => createMoney(minorUnits, "USD");

function deepFreeze(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const entry of Object.values(value)) deepFreeze(entry, seen);
  return Object.freeze(value);
}

function image(side, fixtureId, quality = INTELLIGENCE_CONFIDENCE.HIGH, effects = {}) {
  return {
    imageId: `${fixtureId}-${side.toLowerCase()}`,
    reference: `fixture://${fixtureId}/${side.toLowerCase()}`,
    side,
    quality,
    effects,
    provenance: EVIDENCE_PROVENANCE.OWNER_ENTERED,
  };
}

function frontAndBack(fixtureId) {
  return [image(IMAGE_SIDE.FRONT, fixtureId), image(IMAGE_SIDE.BACK, fixtureId)];
}

function defect(fixtureId, defectType, severity, extra = {}) {
  return {
    observationId: `${fixtureId}-${defectType.toLowerCase()}-${extra.side || IMAGE_SIDE.FRONT}`,
    defectType,
    severity,
    quantity: extra.quantity || 1,
    side: extra.side || IMAGE_SIDE.FRONT,
    locations: extra.locations || [],
    observed: extra.observed !== false,
    structuralDamage: Boolean(extra.structuralDamage),
    confidence: extra.confidence || INTELLIGENCE_CONFIDENCE.HIGH,
    provenance: extra.provenance || EVIDENCE_PROVENANCE.OWNER_ENTERED,
    sourceId: `${fixtureId}-inspection`,
  };
}

function soldEvidence(fixtureId, amountMinor, soldAt = "2026-08-20T12:00:00.000Z") {
  return {
    evidenceId: `${fixtureId}-sold`,
    type: VALUE_EVIDENCE_TYPE.SOLD_COMPARABLE,
    amount: usd(amountMinor),
    shipping: usd(0),
    soldAt,
    sourceId: `${fixtureId}-sold-source`,
    underlyingSourceId: `${fixtureId}-sold-source`,
    sourceQuality: INTELLIGENCE_CONFIDENCE.HIGH,
    verifiedCompletedSale: true,
    condition: CARD_CONDITION.NM,
  };
}

function cardFixture(fixtureId, label, expectedCondition, observations, options = {}) {
  return {
    fixtureId,
    label,
    category: "CARD_CONDITION",
    expected: {
      proposedCondition: expectedCondition,
      resolvedCondition: options.ownerConfirmedCondition || expectedCondition,
      confidence: options.expectedConfidence || INTELLIGENCE_CONFIDENCE.HIGH,
      structuralDamage: Boolean(options.structuralDamage),
    },
    input: {
      images: options.images || frontAndBack(fixtureId),
      observations,
      inspectionComplete: options.inspectionComplete !== false,
      ownerConfirmedCondition: options.ownerConfirmedCondition || null,
    },
  };
}

const fixtures = [
  cardFixture("card-nm", "NM card", CARD_CONDITION.NM, []),
  cardFixture("card-lp", "LP card", CARD_CONDITION.LP, [
    defect("card-lp", DEFECT_TYPE.WHITENING, DEFECT_SEVERITY.MINOR, { side: IMAGE_SIDE.BACK, locations: ["top edge"] }),
  ]),
  cardFixture("card-mp", "MP card", CARD_CONDITION.MP, [
    defect("card-mp", DEFECT_TYPE.EDGE_WEAR, DEFECT_SEVERITY.MODERATE, { side: IMAGE_SIDE.BACK }),
    defect("card-mp", DEFECT_TYPE.SURFACE_SCRATCHES, DEFECT_SEVERITY.MODERATE),
  ]),
  cardFixture("card-hp", "HP card", CARD_CONDITION.HP, [
    defect("card-hp", DEFECT_TYPE.EDGE_WEAR, DEFECT_SEVERITY.SEVERE, { side: IMAGE_SIDE.BACK, quantity: 3 }),
    defect("card-hp", DEFECT_TYPE.HOLO_SCRATCHING, DEFECT_SEVERITY.SEVERE, { quantity: 2 }),
  ]),
  cardFixture("card-dmg", "DMG card", CARD_CONDITION.DMG, [
    defect("card-dmg", DEFECT_TYPE.CREASES, DEFECT_SEVERITY.SEVERE, { structuralDamage: true, locations: ["center"] }),
  ], { structuralDamage: true }),
  cardFixture("card-insufficient-image", "Insufficient image evidence", null, [], {
    images: [image(IMAGE_SIDE.FRONT, "card-insufficient-image", INTELLIGENCE_CONFIDENCE.LOW, { glare: true, sleeve: true, blur: true })],
    inspectionComplete: false,
    expectedConfidence: INTELLIGENCE_CONFIDENCE.INSUFFICIENT,
  }),
  {
    fixtureId: "deal-profitable",
    label: "Profitable deal",
    category: "DEAL",
    expected: { recommendation: "STRONG_BUY", netProfitMinor: 5_300, automaticPurchaseAllowed: false },
    input: {
      askingPrice: usd(2_000),
      purchaseShipping: usd(500),
      purchaseTax: usd(200),
      expectedResaleValue: usd(10_000),
      sellingFeeBasisPoints: 1_000,
      outboundShipping: usd(1_000),
      minimumProfit: usd(2_000),
      strongProfit: usd(5_000),
      minimumRoiBasisPoints: 2_000,
      strongRoiBasisPoints: 4_000,
      confidence: INTELLIGENCE_CONFIDENCE.HIGH,
      completedSaleSampleSize: 5,
      taxKnown: true,
      valueSource: "VERIFIED_COMPLETED_SALES",
    },
  },
  {
    fixtureId: "deal-bad",
    label: "Bad deal",
    category: "DEAL",
    expected: { recommendation: "PASS", netProfitMinor: -4_500, automaticPurchaseAllowed: false },
    input: {
      askingPrice: usd(10_000),
      purchaseShipping: usd(1_000),
      expectedResaleValue: usd(8_000),
      sellingFeeBasisPoints: 1_250,
      outboundShipping: usd(500),
      confidence: INTELLIGENCE_CONFIDENCE.HIGH,
      completedSaleSampleSize: 4,
      risks: [{ code: "DOWNSIDE_LOSS", severity: "HIGH", explanation: "Expected proceeds do not cover acquisition cost." }],
    },
  },
  {
    fixtureId: "deal-insufficient-market",
    label: "Insufficient market data",
    category: "DEAL",
    expected: { recommendation: "INSUFFICIENT_DATA", expectedResaleValue: null },
    input: {
      askingPrice: usd(2_500),
      purchaseShipping: usd(500),
      taxKnown: false,
      completedSaleSampleSize: 0,
      confidence: INTELLIGENCE_CONFIDENCE.INSUFFICIENT,
    },
  },
  {
    fixtureId: "auction-profitable",
    label: "Profitable auction lot",
    category: "AUCTION",
    expected: { hasMaximumBid: true, automaticBidAllowed: false, confidence: INTELLIGENCE_CONFIDENCE.MEDIUM },
    input: {
      lotIdentity: { title: "Mixed collectible lot", lotNumber: "A-101" },
      provider: "MANUAL_AUTHORIZED_SOURCE",
      currentBid: usd(2_500),
      expectedLotValue: usd(20_000),
      conservativeLotValue: usd(12_000),
      buyerPremiumBasisPoints: 1_500,
      taxMode: AUCTION_TAX_MODE.HAMMER_PLUS_PREMIUM,
      taxBasisPoints: 600,
      pickupTravel: usd(1_000),
      labor: usd(500),
      sellingFeeBasisPoints: 1_000,
      sellingFixedCosts: usd(1_000),
      minimumProfit: usd(3_000),
      targetRoiBasisPoints: 2_500,
      confidence: INTELLIGENCE_CONFIDENCE.MEDIUM,
      unknownContentsCount: 0,
      lotContents: ["Three identified sealed products", "One identified card binder"],
    },
  },
  {
    fixtureId: "auction-high-risk",
    label: "High-risk auction lot",
    category: "AUCTION",
    expected: { hasMaximumBid: true, automaticBidAllowed: false, confidence: INTELLIGENCE_CONFIDENCE.LOW, riskCount: 5 },
    input: {
      lotIdentity: { title: "Partially obscured mixed lot", lotNumber: "R-404" },
      provider: "MANUAL_AUTHORIZED_SOURCE",
      currentBid: usd(1_500),
      expectedLotValue: usd(8_000),
      conservativeLotValue: usd(1_500),
      buyerPremiumBasisPoints: 2_000,
      taxMode: AUCTION_TAX_MODE.HAMMER_PLUS_PREMIUM,
      taxBasisPoints: 700,
      shipping: usd(2_000),
      labor: usd(1_500),
      disposal: usd(1_000),
      sellingFeeBasisPoints: 1_300,
      minimumProfit: usd(2_000),
      targetRoiBasisPoints: 3_000,
      confidence: INTELLIGENCE_CONFIDENCE.LOW,
      ownerEnteredMaximum: usd(1_000),
      unknownContentsCount: 12,
      lotContents: ["One probable binder", "Twelve obscured containers"],
      riskFlags: ["UNKNOWN_CONTENTS", "AUTHENTICITY_UNCERTAIN", "HIGH_LABOR_BURDEN"],
    },
  },
  {
    fixtureId: "restock-high-confidence",
    label: "Restock high confidence",
    category: "RESTOCK",
    expected: { likelihoodBand: RESTOCK_LIKELIHOOD.HIGH, confidence: INTELLIGENCE_CONFIDENCE.HIGH, timeBand: "MORNING" },
    input: {
      storeId: "fixture-store-1",
      productId: "fixture-product-1",
      asOf: PHASE_1C_QA_CLOCK,
      observations: [0, 7, 14, 21, 28, 35].map((days, index) => ({
        observationId: `restock-high-${index + 1}`,
        type: RESTOCK_OBSERVATION_TYPE.RESTOCK_EVIDENCE,
        storeId: "fixture-store-1",
        productId: "fixture-product-1",
        occurredAt: new Date(Date.parse("2026-08-24T10:00:00.000Z") - days * 86_400_000).toISOString(),
        sourceId: `owner-observation-${index + 1}`,
        underlyingSourceId: `owner-observation-${index + 1}`,
        confidence: INTELLIGENCE_CONFIDENCE.HIGH,
        evidence: "Owner-confirmed shelf observation.",
      })),
    },
  },
  {
    fixtureId: "restock-low-confidence",
    label: "Restock low confidence",
    category: "RESTOCK",
    expected: { likelihoodBand: RESTOCK_LIKELIHOOD.LOW, expectedWindow: null },
    input: {
      storeId: "fixture-store-2",
      productId: "fixture-product-2",
      asOf: PHASE_1C_QA_CLOCK,
      observations: [{
        observationId: "restock-low-1",
        type: RESTOCK_OBSERVATION_TYPE.STOCK_OBSERVED,
        storeId: "fixture-store-2",
        productId: "fixture-product-2",
        occurredAt: "2026-08-20T15:30:00.000Z",
        sourceId: "single-owner-observation",
        underlyingSourceId: "single-owner-observation",
        confidence: INTELLIGENCE_CONFIDENCE.MEDIUM,
      }],
    },
  },
  cardFixture("owner-corrected-analysis", "Owner-corrected analysis", CARD_CONDITION.MP, [
    defect("owner-corrected-analysis", DEFECT_TYPE.EDGE_WEAR, DEFECT_SEVERITY.MODERATE, { side: IMAGE_SIDE.BACK }),
    defect("owner-corrected-analysis", DEFECT_TYPE.SURFACE_SCRATCHES, DEFECT_SEVERITY.MODERATE),
  ], { ownerConfirmedCondition: CARD_CONDITION.LP }),
  {
    fixtureId: "reanalysis-new-evidence",
    label: "Reanalysis changed by new evidence",
    category: "REANALYSIS",
    expected: {
      previousCondition: CARD_CONDITION.LP,
      currentCondition: CARD_CONDITION.MP,
      previousValueMinor: 4_200,
      currentValueMinor: 3_100,
      inputHashChanged: true,
    },
    input: {
      previous: {
        requestedAt: "2026-08-25T13:00:00.000Z",
        identity: {
          productName: "Fixture Card 001",
          set: "Code 3 QA Set",
          cardNumber: "001",
          language: "English",
          format: "RAW",
          source: EVIDENCE_PROVENANCE.OWNER_ENTERED,
          confidence: INTELLIGENCE_CONFIDENCE.HIGH,
        },
        images: frontAndBack("reanalysis-previous"),
        observations: [
          defect("reanalysis-previous", DEFECT_TYPE.WHITENING, DEFECT_SEVERITY.MINOR, { side: IMAGE_SIDE.BACK }),
        ],
        inspectionComplete: true,
        valuationEvidence: [soldEvidence("reanalysis-previous", 4_941)],
      },
      current: {
        requestedAt: "2026-08-25T13:00:00.000Z",
        identity: {
          productName: "Fixture Card 001",
          set: "Code 3 QA Set",
          cardNumber: "001",
          language: "English",
          format: "RAW",
          source: EVIDENCE_PROVENANCE.OWNER_ENTERED,
          confidence: INTELLIGENCE_CONFIDENCE.HIGH,
        },
        images: frontAndBack("reanalysis-current"),
        observations: [
          defect("reanalysis-current", DEFECT_TYPE.WHITENING, DEFECT_SEVERITY.MODERATE, { side: IMAGE_SIDE.BACK }),
          defect("reanalysis-current", DEFECT_TYPE.SURFACE_SCRATCHES, DEFECT_SEVERITY.MODERATE, { side: IMAGE_SIDE.BACK }),
        ],
        inspectionComplete: true,
        valuationEvidence: [soldEvidence("reanalysis-current", 4_769)],
      },
    },
  },
];

export const PHASE_1C_QA_FIXTURES = deepFreeze(fixtures);
export const PHASE_1C_QA_FIXTURE_BY_ID = deepFreeze(Object.fromEntries(
  PHASE_1C_QA_FIXTURES.map((fixture) => [fixture.fixtureId, fixture]),
));

export function getPhase1cQaFixture(fixtureId) {
  return PHASE_1C_QA_FIXTURE_BY_ID[String(fixtureId)] || null;
}

export async function evaluatePhase1cQaFixture(fixture, options = {}) {
  const selected = typeof fixture === "string" ? getPhase1cQaFixture(fixture) : fixture;
  if (!selected) throw new Error("Unknown Phase 1C QA fixture.");
  if (selected.category === "CARD_CONDITION") return assessCardCondition(selected.input);
  if (selected.category === "DEAL") return analyzeDealIntelligence(selected.input);
  if (selected.category === "AUCTION") return analyzeAuctionIntelligence(selected.input);
  if (selected.category === "RESTOCK") return analyzeRestockIntelligence(selected.input);
  if (selected.category === "REANALYSIS") {
    const pipeline = createCardAnalysisPipeline({ clock: options.clock || (() => PHASE_1C_QA_CLOCK) });
    const previous = await pipeline.analyze(selected.input.previous);
    const current = await pipeline.analyze(selected.input.current);
    return Object.freeze({ previous, current });
  }
  throw new Error(`Unsupported Phase 1C QA fixture category ${selected.category}.`);
}
