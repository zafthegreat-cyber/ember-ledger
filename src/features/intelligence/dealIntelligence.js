import {
  ANALYSIS_METHODOLOGY,
  DEAL_RECOMMENDATION,
  INTELLIGENCE_CONFIDENCE,
} from "./constants.js";
import {
  addMoney,
  assertMoney,
  assertSameCurrency,
  calculateBasisPointAmount,
  calculateRatioBasisPoints,
  createMoney,
  formatMoneyForExplanation,
  subtractMoney,
} from "./money.js";

function optionalMoney(value, currency, field) {
  return value === null || value === undefined ? createMoney(0, currency) : assertMoney(value, { field });
}

function normalizeRisk(value, index) {
  if (typeof value === "string") return Object.freeze({ code: value, severity: "MEDIUM", explanation: value });
  if (!value || typeof value !== "object") throw new Error(`risks[${index}] is invalid.`);
  const severity = String(value.severity || "MEDIUM").toUpperCase();
  if (!["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(severity)) throw new Error(`risks[${index}].severity is invalid.`);
  return Object.freeze({
    code: String(value.code || `RISK_${index + 1}`),
    severity,
    explanation: String(value.explanation || value.code || "Risk requires owner review."),
  });
}

export function analyzeDealIntelligence(input = {}) {
  const askingPrice = assertMoney(input.askingPrice, { field: "askingPrice" });
  const currency = askingPrice.currency;
  const expectedResaleValue = input.expectedResaleValue
    ? assertMoney(input.expectedResaleValue, { field: "expectedResaleValue" })
    : null;
  const purchaseShipping = optionalMoney(input.purchaseShipping, currency, "purchaseShipping");
  const purchaseTax = optionalMoney(input.purchaseTax, currency, "purchaseTax");
  const acquisitionFees = optionalMoney(input.acquisitionFees, currency, "acquisitionFees");
  const travelCost = optionalMoney(input.travelCost, currency, "travelCost");
  const fixedSellingFees = optionalMoney(input.fixedSellingFees, currency, "fixedSellingFees");
  const outboundShipping = optionalMoney(input.outboundShipping, currency, "outboundShipping");
  const packagingCost = optionalMoney(input.packagingCost, currency, "packagingCost");
  const returnReserve = optionalMoney(input.returnReserve, currency, "returnReserve");
  const minimumProfit = input.minimumProfit
    ? assertMoney(input.minimumProfit, { field: "minimumProfit" })
    : createMoney(2_000, currency);
  const strongProfit = input.strongProfit
    ? assertMoney(input.strongProfit, { field: "strongProfit" })
    : createMoney(5_000, currency);
  assertSameCurrency([
    askingPrice,
    expectedResaleValue,
    purchaseShipping,
    purchaseTax,
    acquisitionFees,
    travelCost,
    fixedSellingFees,
    outboundShipping,
    packagingCost,
    returnReserve,
    minimumProfit,
    strongProfit,
  ].filter(Boolean), "deal");
  const sellingFeeBasisPoints = input.sellingFeeBasisPoints ?? 1_300;
  const acquisitionCost = addMoney([
    askingPrice,
    purchaseShipping,
    purchaseTax,
    acquisitionFees,
    travelCost,
  ], { field: "acquisitionCost" });
  const risks = Object.freeze((Array.isArray(input.risks) ? input.risks : []).map(normalizeRisk));
  const warnings = [];
  if (input.taxKnown === false) warnings.push("Purchase tax is unknown and is not included in the estimate.");
  if (!expectedResaleValue) warnings.push("No supported expected resale value is available.");
  if (input.completedSaleSampleSize === 0) warnings.push("No verified completed-sale comparable supports the resale assumption.");

  if (!expectedResaleValue || expectedResaleValue.minorUnits <= 0) {
    return Object.freeze({
      methodologyVersion: ANALYSIS_METHODOLOGY.DEAL,
      recommendation: DEAL_RECOMMENDATION.INSUFFICIENT_DATA,
      advisoryOnly: true,
      automaticPurchaseAllowed: false,
      askingPrice,
      estimatedAcquisitionCost: acquisitionCost,
      acquisitionCostBreakdown: Object.freeze({ askingPrice, purchaseShipping, purchaseTax, acquisitionFees, travelCost }),
      expectedResaleValue: null,
      estimatedSellingFees: null,
      estimatedGrossProfit: null,
      estimatedNetProfit: null,
      estimatedRoiBasisPoints: null,
      marginOfSafetyBasisPoints: null,
      confidence: INTELLIGENCE_CONFIDENCE.INSUFFICIENT,
      risks,
      warnings: Object.freeze(warnings),
      rationale: "INSUFFICIENT_DATA because a supported expected resale value is not available; owner review or a manual assumption is required.",
      assumptions: Object.freeze({ sellingFeeBasisPoints, minimumProfit, minimumRoiBasisPoints: input.minimumRoiBasisPoints ?? 2_000 }),
    });
  }

  const percentageFee = calculateBasisPointAmount(expectedResaleValue, sellingFeeBasisPoints, {
    field: "sellingFeeBasisPoints",
  });
  const sellingCosts = addMoney([
    percentageFee.amount,
    fixedSellingFees,
    outboundShipping,
    packagingCost,
    returnReserve,
  ], { field: "sellingCosts" });
  const expectedNetProceeds = subtractMoney(expectedResaleValue, sellingCosts);
  const grossProfit = subtractMoney(expectedResaleValue, acquisitionCost);
  const netProfit = subtractMoney(expectedNetProceeds, acquisitionCost);
  const roiBasisPoints = calculateRatioBasisPoints(netProfit, acquisitionCost, "roi");
  const marginOfSafety = subtractMoney(expectedResaleValue, acquisitionCost);
  const marginOfSafetyBasisPoints = calculateRatioBasisPoints(marginOfSafety, expectedResaleValue, "marginOfSafety");
  const minimumRoiBasisPoints = input.minimumRoiBasisPoints ?? 2_000;
  const strongRoiBasisPoints = input.strongRoiBasisPoints ?? 4_000;
  if (![minimumRoiBasisPoints, strongRoiBasisPoints].every((value) => Number.isSafeInteger(value) && value >= 0)) {
    throw new Error("ROI thresholds must be non-negative basis-point integers.");
  }
  const confidence = Object.values(INTELLIGENCE_CONFIDENCE).includes(input.confidence)
    ? input.confidence
    : INTELLIGENCE_CONFIDENCE.LOW;
  const hasCriticalRisk = risks.some((risk) => risk.severity === "CRITICAL");
  const hasHighRisk = risks.some((risk) => risk.severity === "HIGH");
  const meetsMinimum = netProfit.minorUnits >= minimumProfit.minorUnits
    && roiBasisPoints !== null
    && roiBasisPoints >= minimumRoiBasisPoints;
  const meetsStrong = netProfit.minorUnits >= strongProfit.minorUnits
    && roiBasisPoints !== null
    && roiBasisPoints >= strongRoiBasisPoints;

  let recommendation;
  if (netProfit.minorUnits < 0 || hasCriticalRisk) recommendation = DEAL_RECOMMENDATION.PASS;
  else if (confidence === INTELLIGENCE_CONFIDENCE.INSUFFICIENT) recommendation = DEAL_RECOMMENDATION.INSUFFICIENT_DATA;
  else if (hasHighRisk || confidence === INTELLIGENCE_CONFIDENCE.LOW || !meetsMinimum) recommendation = DEAL_RECOMMENDATION.WATCH;
  else if (meetsStrong && confidence === INTELLIGENCE_CONFIDENCE.HIGH) recommendation = DEAL_RECOMMENDATION.STRONG_BUY;
  else recommendation = DEAL_RECOMMENDATION.BUY;

  const rationaleParts = [
    `${recommendation} is advisory only.`,
    `Estimated acquisition cost is ${formatMoneyForExplanation(acquisitionCost)} and estimated net profit is ${formatMoneyForExplanation(netProfit)}.`,
    roiBasisPoints === null ? "ROI is unavailable." : `Estimated ROI is ${(roiBasisPoints / 100).toFixed(2)}%.`,
  ];
  if (hasCriticalRisk || hasHighRisk) rationaleParts.push("Major risk flags limit the recommendation regardless of projected upside.");
  if (confidence === INTELLIGENCE_CONFIDENCE.LOW) rationaleParts.push("Low confidence limits the result to WATCH even when projected metrics are positive.");
  if (input.completedSaleSampleSize === 0) rationaleParts.push("The value may be owner-supplied or provider-derived because no verified sold comparable is available.");

  return Object.freeze({
    methodologyVersion: ANALYSIS_METHODOLOGY.DEAL,
    recommendation,
    advisoryOnly: true,
    automaticPurchaseAllowed: false,
    askingPrice,
    estimatedAcquisitionCost: acquisitionCost,
    acquisitionCostBreakdown: Object.freeze({ askingPrice, purchaseShipping, purchaseTax, acquisitionFees, travelCost }),
    expectedResaleValue,
    estimatedSellingFees: percentageFee.amount,
    estimatedSellingCosts: sellingCosts,
    sellingCostBreakdown: Object.freeze({
      percentageFees: percentageFee.amount,
      fixedSellingFees,
      outboundShipping,
      packagingCost,
      returnReserve,
    }),
    expectedNetProceeds,
    estimatedGrossProfit: grossProfit,
    estimatedNetProfit: netProfit,
    estimatedRoiBasisPoints: roiBasisPoints,
    marginOfSafetyBasisPoints,
    confidence,
    risks,
    warnings: Object.freeze(warnings),
    rationale: rationaleParts.join(" "),
    assumptions: Object.freeze({
      sellingFeeBasisPoints,
      minimumProfit,
      minimumRoiBasisPoints,
      strongProfit,
      strongRoiBasisPoints,
      taxKnown: input.taxKnown !== false,
      valueSource: String(input.valueSource || "UNSPECIFIED"),
    }),
    rounding: Object.freeze({ sellingFee: percentageFee.rounding }),
  });
}
