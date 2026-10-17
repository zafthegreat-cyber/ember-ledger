import assert from "node:assert/strict";
import {
  analyzeAuctionForm,
  buildCardAnalysisInput,
  formatMinorMoney,
  minorMoneyToMajorInput,
  nextOwnerObservationId,
  optionalMoney,
  selectVerifiedStoredComparables,
  stableOwnerObservationId,
} from "../src/features/flipScout/intelligenceFormAdapter.js";
import {
  RESTOCK_PREDICTION_OUTCOME,
  VISIT_OUTCOME,
  isConfirmedRestockStatus,
  latestConfirmedRestockEvent,
  matchesRestockStore,
  restockPredictionOutcome,
  restockVisitOutcome,
} from "../src/features/ownerCenter/restockStatus.js";
import { analyzeDealIntelligence } from "../src/features/intelligence/index.js";
import { restockPatternSummary } from "../src/features/ownerCenter/ownerCenterModel.js";
import { buildRestockObservations } from "../src/features/ownerCenter/restockIntelligenceAdapter.js";

let assertions = 0;
function check(name, callback) {
  callback();
  console.log(`PASS ${name}`);
}
function equal(actual, expected, message) {
  assertions += 1;
  assert.equal(actual, expected, message);
}
function ok(value, message) {
  assertions += 1;
  assert.ok(value, message);
}

const observation = {
  defectType: "WHITENING",
  severity: "MINOR",
  side: "BACK",
  quantity: 1,
  location: "top edge",
  structuralDamage: false,
  confidence: "MEDIUM",
  note: "light wear",
};

check("owner observation IDs are deterministic and distinguish duplicate occurrences", () => {
  equal(stableOwnerObservationId(observation, 1), stableOwnerObservationId({ ...observation }, 1));
  ok(stableOwnerObservationId(observation, 1) !== stableOwnerObservationId(observation, 2));
  const first = stableOwnerObservationId(observation, 1);
  const second = stableOwnerObservationId(observation, 2);
  equal(nextOwnerObservationId(observation, [{ observationId: second }]), first);
  equal(nextOwnerObservationId(observation, [{ observationId: first }]), second);
});

check("minor-unit form formatting is exact near the safe integer boundary", () => {
  const text = minorMoneyToMajorInput({ minorUnits: 9_007_199_254_740_990, currency: "USD" });
  equal(text, "90071992547409.90");
  equal(optionalMoney(text, "roundTrip").minorUnits, 9_007_199_254_740_990);
  const maximum = minorMoneyToMajorInput({ minorUnits: Number.MAX_SAFE_INTEGER, currency: "USD" });
  equal(maximum, "90071992547409.91");
  equal(optionalMoney(maximum, "maximumRoundTrip").minorUnits, Number.MAX_SAFE_INTEGER);
  equal(formatMinorMoney({ minorUnits: Number.MAX_SAFE_INTEGER, currency: "USD" }), "$90,071,992,547,409.91");
});

check("verified completed sales require a traceable source reference", () => {
  assertions += 1;
  assert.throws(() => buildCardAnalysisInput({
    completedSalesText: "42.00 | 2026-08-01",
    completedSalesVerified: true,
  }), /sourceReference is required/);
});

check("unattributed comparable lines do not pretend to be independent sources", () => {
  const input = buildCardAnalysisInput({
    completedSalesText: "42.00 | 2026-08-01\n44.00 | 2026-08-02",
    completedSalesVerified: false,
  });
  const sales = input.valuationEvidence.filter((entry) => entry.type === "SOLD_COMPARABLE");
  equal(sales.length, 2);
  equal(new Set(sales.map((entry) => entry.underlyingSourceId)).size, 1);
  ok(sales.every((entry) => entry.verifiedCompletedSale === false));
});

check("completed-sale lines retain a validated condition basis", () => {
  const input = buildCardAnalysisInput({
    completedSalesText: "42.00 | 2026-08-01 | provider-sale-1 | MP",
    completedSalesVerified: true,
  });
  const comparable = input.valuationEvidence.find((entry) => entry.type === "SOLD_COMPARABLE");
  equal(comparable.condition, "MP");
  assertions += 1;
  assert.throws(() => buildCardAnalysisInput({
    completedSalesText: "42.00 | 2026-08-01 | provider-sale-2 | MINT",
    completedSalesVerified: true,
  }), /condition must be NM, LP, MP, HP, or DMG/);
});

check("saved-analysis fallback never promotes unverified sold claims", () => {
  const verified = selectVerifiedStoredComparables([
    { type: "SOLD_COMPARABLE", verifiedCompletedSale: false, sourceId: "unverified" },
    { type: "SOLD_COMPARABLE", verifiedCompletedSale: true, sourceId: "" },
    { type: "SOLD_COMPARABLE", verifiedCompletedSale: true, sourceId: "verified-source" },
    { type: "ACTIVE_LISTING", verifiedCompletedSale: true, sourceId: "active-ask" },
  ]);
  equal(verified.length, 1);
  equal(verified[0].sourceId, "verified-source");
});

check("editable marketplace text cannot impersonate official eBay provider evidence", () => {
  const input = buildCardAnalysisInput({
    marketplace: "eBay",
    title: "Owner-entered listing title",
    askingPrice: "42.00",
  });
  equal(input.identity.source, "OWNER_ENTERED");
  equal(input.sourceEvidence.length, 0);
  equal(input.valuationEvidence.filter((entry) => entry.type === "ACTIVE_LISTING").length, 0);
});

check("trusted eBay evidence preserves provider provenance without fabricating currency or identity authority", () => {
  const input = buildCardAnalysisInput({
    providerId: "ebay",
    marketplace: "eBay",
    externalListingId: "listing-123",
    title: "Provider listing title",
    askingPrice: "42.00",
    priceCurrency: "",
    lastCheckedAt: "2026-08-25T12:00:00Z",
  });
  equal(input.identity.source, "OWNER_ENTERED");
  equal(input.sourceEvidence.length, 1);
  equal(input.sourceEvidence[0].providerId, "ebay");
  ok(input.sourceEvidence[0].observations.some((entry) => entry.observationType === "LISTING_TITLE" && entry.provenance.kind === "PROVIDER_SUPPLIED"));
  equal(input.valuationEvidence.filter((entry) => entry.type === "ACTIVE_LISTING").length, 0);
  ok(input.warnings.some((warning) => warning.startsWith("MISSING_ACTIVE_ASKING_PRICE_CURRENCY:")));
});

check("owner-selected major risk severity limits an otherwise profitable deal", () => {
  const input = buildCardAnalysisInput({
    purchasePrice: "10.00",
    expectedResaleMidpoint: "100.00",
    riskSeverity: "CRITICAL",
    riskNotes: "Suspected counterfeit",
    confidence: "HIGH",
  });
  equal(input.dealAssumptions.risks[0].severity, "CRITICAL");
  equal(analyzeDealIntelligence(input.dealAssumptions).recommendation, "PASS");
});

const auctionBase = {
  title: "Mixed card lot",
  currentBid: "10.00",
  estimatedResaleLow: "70.00",
  estimatedResaleMid: "100.00",
  buyerPremiumPercentage: "15",
  purchaseShipping: "12.00",
  taxRate: "6",
  taxBase: "hammer_plus_premium",
  sellingFeePercentage: "13",
  desiredProfit: "20.00",
  desiredRoi: "20",
  riskLevel: "Low",
  intelligenceConfidence: "HIGH",
  unknownContentsCount: "0",
};

check("auction confidence is derived and cannot be promoted by a browser field", () => {
  const result = analyzeAuctionForm(auctionBase);
  equal(result.confidence, "LOW");
  equal(result.valuationBasis, "OWNER_MIDPOINT_ASSUMPTION");
  equal(result.automaticBidAllowed, false);
});

check("structured lot estimates drive conservative expected and optimistic scenarios", () => {
  const result = analyzeAuctionForm({
    ...auctionBase,
    lotItemEstimatesText: [
      "identified | Charizard | 1 | 40.00 | 60.00 | 80.00 | 85 | no | no",
      "probable | Vintage holo | 2 | 8.00 | 15.00 | 25.00 | 60 | yes | yes",
    ].join("\n"),
  });
  equal(result.valuationBasis, "STRUCTURED_LOT_ANALYSIS");
  equal(result.lotAnalysis.identifiedItems.length, 1);
  equal(result.lotAnalysis.probableItems.length, 1);
  ok(result.lotAnalysis.scenarios.conservative.netValue.minorUnits < result.lotAnalysis.scenarios.expected.netValue.minorUnits);
  ok(result.lotAnalysis.scenarios.expected.netValue.minorUnits < result.lotAnalysis.scenarios.optimistic.netValue.minorUnits);
  ok(result.confidence !== "HIGH");
});

check("auction confidence follows the owner value when structured sellable value is zero", () => {
  const result = analyzeAuctionForm({
    ...auctionBase,
    lotItemEstimatesText: Array.from({ length: 8 }, (_, index) => (
      `identified | Card ${index + 1} | 1 | 10.00 | 20.00 | 30.00 | 0 | no | no`
    )).join("\n"),
  });
  equal(result.valuationBasis, "OWNER_MIDPOINT_ASSUMPTION");
  equal(result.confidence, "LOW");
});

check("unknown auction contents force low confidence and receive no invented value", () => {
  const result = analyzeAuctionForm({
    ...auctionBase,
    lotItemEstimatesText: "identified | Visible card | 1 | 100.00 | 150.00 | 200.00 | 80 | no | no",
    unknownContentsCount: "4",
    unknownContentsBulkValue: "",
  });
  equal(result.confidence, "LOW");
  equal(result.lotAnalysis.unknownContentsValuePolicy, "ZERO_UNLESS_OWNER_SUPPLIES_BULK_VALUE");
  ok(result.warnings.some((warning) => /Unknown contents/i.test(warning)));
});

check("restock status parsing rejects negative substring matches", () => {
  equal(isConfirmedRestockStatus("Unconfirmed report"), false);
  equal(isConfirmedRestockStatus("No purchase"), false);
  equal(isConfirmedRestockStatus("Confirmed in stock"), true);
  equal(restockVisitOutcome({ status: "Unsuccessful visit" }), VISIT_OUTCOME.UNSUCCESSFUL);
  equal(restockVisitOutcome({ notes: "No purchase and items not found" }), VISIT_OUTCOME.UNSUCCESSFUL);
  equal(restockVisitOutcome({ status: "Successful purchase recorded" }), VISIT_OUTCOME.SUCCESS);
  equal(restockPredictionOutcome("Incorrect"), RESTOCK_PREDICTION_OUTCOME.INCORRECT);
  equal(restockPredictionOutcome("Confirmed correct"), RESTOCK_PREDICTION_OUTCOME.CORRECT);
  equal(restockPredictionOutcome("Unconfirmed"), RESTOCK_PREDICTION_OUTCOME.UNKNOWN);
  equal(restockPredictionOutcome("Not correct"), RESTOCK_PREDICTION_OUTCOME.UNKNOWN);
});

check("restock store matching prefers stable IDs and confirmation time ignores newer unconfirmed reports", () => {
  const store = { id: "store-a", store: "Target", retailer: "Target", address: "One Main Street" };
  equal(matchesRestockStore({ storeId: "store-b", store: "Target", retailer: "Target", address: "One Main Street" }, store), false);
  equal(matchesRestockStore({ store: "Target", retailer: "Target", address: "One Main Street" }, store), true);
  equal(matchesRestockStore({ store: "Target", retailer: "Target", address: "Two Main Street" }, store), false);
  const latest = latestConfirmedRestockEvent([
    { id: "confirmed", confirmationStatus: "Confirmed", eventTime: "2026-08-20T10:00:00Z" },
    { id: "unconfirmed", confirmationStatus: "Unconfirmed report", eventTime: "2026-08-24T10:00:00Z" },
  ]);
  equal(latest.id, "confirmed");
});

check("restock adapter rejects negative and non-finite quantities", () => {
  for (const quantity of [-1, "not-a-number"]) {
    assertions += 1;
    assert.throws(() => buildRestockObservations({
      observations: [{ id: "bad-quantity", dateSeen: "2026-08-24T10:00:00Z", quantity, status: "In stock" }],
    }), /finite non-negative number/);
  }
});

check("restock summaries exclude unconfirmed reports and negative substring outcomes", () => {
  const result = restockPatternSummary({
    events: [
      { confirmationStatus: "Confirmed", eventTime: "2026-08-01T10:00:00Z" },
      { confirmationStatus: "Unconfirmed", eventTime: "2026-08-08T10:00:00Z" },
    ],
    predictions: [{ outcome: "Correct" }, { outcome: "Incorrect" }],
    visits: [{ outcome: "Successful" }, { outcome: "Unsuccessful" }, { outcome: "Not reviewed" }],
  });
  equal(result.supportingReportCount, 1);
  equal(result.predictionAccuracy, 0.5);
  equal(result.successfulTripRate, 0.5);
});

console.log(`Code 3 intelligence UI/integration boundaries: ${assertions} assertions passed.`);
