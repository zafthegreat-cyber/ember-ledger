import { ANALYSIS_METHODOLOGY, INTELLIGENCE_CONFIDENCE } from "./constants.js";
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

export const AUCTION_TAX_MODE = Object.freeze({
  NONE: "NONE",
  HAMMER_ONLY: "HAMMER_ONLY",
  HAMMER_PLUS_PREMIUM: "HAMMER_PLUS_PREMIUM",
  MANUAL_TAXABLE_SUBTOTAL: "MANUAL_TAXABLE_SUBTOTAL",
  ACTUAL_TAX_AMOUNT: "ACTUAL_TAX_AMOUNT",
});

const AUCTION_TAX_EXPLANATION = Object.freeze({
  [AUCTION_TAX_MODE.NONE]: "no additional tax",
  [AUCTION_TAX_MODE.HAMMER_ONLY]: "tax on the winning bid",
  [AUCTION_TAX_MODE.HAMMER_PLUS_PREMIUM]: "tax on the winning bid and buyer premium",
  [AUCTION_TAX_MODE.MANUAL_TAXABLE_SUBTOTAL]: "the owner-entered taxable subtotal",
  [AUCTION_TAX_MODE.ACTUAL_TAX_AMOUNT]: "the owner-entered actual tax",
});

function optionalMoney(value, currency, field) {
  return value === null || value === undefined ? createMoney(0, currency) : assertMoney(value, { field });
}

function totalAtBid(bid, input, fixedAcquisitionCosts) {
  const premium = calculateBasisPointAmount(bid, input.buyerPremiumBasisPoints, { field: "buyerPremiumBasisPoints" });
  const taxMode = input.taxMode;
  let taxable = createMoney(0, bid.currency);
  let tax;
  if (taxMode === AUCTION_TAX_MODE.NONE) {
    tax = { amount: createMoney(0, bid.currency), rounding: null };
  } else if (taxMode === AUCTION_TAX_MODE.ACTUAL_TAX_AMOUNT) {
    tax = { amount: input.actualTaxAmount, rounding: null };
  } else {
    if (taxMode === AUCTION_TAX_MODE.HAMMER_ONLY) taxable = bid;
    if (taxMode === AUCTION_TAX_MODE.HAMMER_PLUS_PREMIUM) taxable = addMoney([bid, premium.amount]);
    if (taxMode === AUCTION_TAX_MODE.MANUAL_TAXABLE_SUBTOTAL) taxable = input.manualTaxableSubtotal;
    tax = calculateBasisPointAmount(taxable, input.taxBasisPoints, { field: "taxBasisPoints" });
  }
  return {
    bid,
    buyerPremium: premium.amount,
    tax: tax.amount,
    fixedAcquisitionCosts,
    total: addMoney([bid, premium.amount, tax.amount, fixedAcquisitionCosts]),
    rounding: { buyerPremium: premium.rounding, tax: tax.rounding },
  };
}

function satisfiesTargets(cost, netProceeds, minimumProfit, targetRoiBasisPoints) {
  // ROI is undefined at zero acquisition cost. A zero-cost candidate therefore
  // cannot prove an ROI target and must not become a misleading bid ceiling.
  if (cost.minorUnits <= 0) return false;
  const profit = subtractMoney(netProceeds, cost);
  const roi = calculateRatioBasisPoints(profit, cost, "auctionRoi");
  return profit.minorUnits >= minimumProfit.minorUnits && roi !== null && roi >= targetRoiBasisPoints;
}

function solveMaximumBid(input, netProceeds, fixedAcquisitionCosts, minimumProfit, targetRoiBasisPoints) {
  let low = 0;
  let high = Math.max(0, netProceeds.minorUnits);
  let best = null;
  while (low <= high) {
    const midpoint = Math.floor((low + high) / 2);
    const bid = createMoney(midpoint, netProceeds.currency);
    const cost = totalAtBid(bid, input, fixedAcquisitionCosts).total;
    if (satisfiesTargets(cost, netProceeds, minimumProfit, targetRoiBasisPoints)) {
      best = midpoint;
      low = midpoint + 1;
    } else {
      high = midpoint - 1;
    }
  }
  return best === null ? null : createMoney(best, netProceeds.currency);
}

export function analyzeAuctionIntelligence(rawInput = {}) {
  const currentBid = assertMoney(rawInput.currentBid, { field: "currentBid" });
  const currency = currentBid.currency;
  const expectedLotValue = rawInput.expectedLotValue ? assertMoney(rawInput.expectedLotValue, { field: "expectedLotValue" }) : null;
  const conservativeLotValue = rawInput.conservativeLotValue ? assertMoney(rawInput.conservativeLotValue, { field: "conservativeLotValue" }) : null;
  const shipping = optionalMoney(rawInput.shipping, currency, "shipping");
  const pickupTravel = optionalMoney(rawInput.pickupTravel, currency, "pickupTravel");
  const fixedFees = optionalMoney(rawInput.fixedFees, currency, "fixedFees");
  const labor = optionalMoney(rawInput.labor, currency, "labor");
  const disposal = optionalMoney(rawInput.disposal, currency, "disposal");
  const sellingFixedCosts = optionalMoney(rawInput.sellingFixedCosts, currency, "sellingFixedCosts");
  const minimumProfit = rawInput.minimumProfit ? assertMoney(rawInput.minimumProfit, { field: "minimumProfit" }) : createMoney(2_000, currency);
  const ownerEnteredMaximum = rawInput.ownerEnteredMaximum ? assertMoney(rawInput.ownerEnteredMaximum, { field: "ownerEnteredMaximum" }) : null;
  const actualTaxAmount = optionalMoney(rawInput.actualTaxAmount, currency, "actualTaxAmount");
  const manualTaxableSubtotal = optionalMoney(rawInput.manualTaxableSubtotal, currency, "manualTaxableSubtotal");
  assertSameCurrency([
    currentBid,
    expectedLotValue,
    conservativeLotValue,
    shipping,
    pickupTravel,
    fixedFees,
    labor,
    disposal,
    sellingFixedCosts,
    minimumProfit,
    ownerEnteredMaximum,
    actualTaxAmount,
    manualTaxableSubtotal,
  ].filter(Boolean), "auction");
  const input = {
    buyerPremiumBasisPoints: rawInput.buyerPremiumBasisPoints ?? 0,
    taxBasisPoints: rawInput.taxBasisPoints ?? 0,
    taxMode: rawInput.taxMode || AUCTION_TAX_MODE.NONE,
    actualTaxAmount,
    manualTaxableSubtotal,
  };
  if (!Object.values(AUCTION_TAX_MODE).includes(input.taxMode)) throw new Error("taxMode is unsupported.");
  if (![input.buyerPremiumBasisPoints, input.taxBasisPoints].every((value) => Number.isSafeInteger(value) && value >= 0 && value <= 100_000)) {
    throw new Error("Auction percentage assumptions must use bounded integer basis points.");
  }
  const fixedAcquisitionCosts = addMoney([shipping, pickupTravel, fixedFees, labor, disposal]);
  const currentCost = totalAtBid(currentBid, input, fixedAcquisitionCosts);
  const targetRoiBasisPoints = rawInput.targetRoiBasisPoints ?? 2_000;
  const sellingFeeBasisPoints = rawInput.sellingFeeBasisPoints ?? 1_300;
  const warnings = [];
  if (rawInput.taxKnown === false) warnings.push("Auction tax is unknown and is excluded from the recommendation.");
  if (Number(rawInput.unknownContentsCount || 0) > 0) warnings.push("Unknown contents are not assigned value unless included in an explicit owner lot assumption.");
  if (!expectedLotValue) {
    return Object.freeze({
      methodologyVersion: ANALYSIS_METHODOLOGY.AUCTION,
      maximumRecommendedBid: null,
      targetAcquisitionPrice: null,
      ownerEnteredMaximum,
      currentBid,
      currentTotalAcquisitionCost: currentCost.total,
      expectedNetProceeds: null,
      confidence: INTELLIGENCE_CONFIDENCE.INSUFFICIENT,
      warnings: Object.freeze(["Expected lot value is required before a maximum bid can be calculated.", ...warnings]),
      explanation: "No maximum bid is proposed because expected lot value is missing.",
      advisoryOnly: true,
      automaticBidAllowed: false,
    });
  }

  const sellingFee = calculateBasisPointAmount(expectedLotValue, sellingFeeBasisPoints, { field: "sellingFeeBasisPoints" });
  const expectedNetProceeds = subtractMoney(expectedLotValue, addMoney([sellingFee.amount, sellingFixedCosts]));
  const maximumRecommendedBid = solveMaximumBid(input, expectedNetProceeds, fixedAcquisitionCosts, minimumProfit, targetRoiBasisPoints);
  if (!maximumRecommendedBid) {
    const infeasibleWarnings = [
      "No nonnegative bid satisfies the configured minimum-profit and ROI targets.",
      ...(currentBid.minorUnits > 0 ? ["The current bid is already above every supported bid ceiling under these assumptions."] : []),
      ...(ownerEnteredMaximum?.minorUnits > 0 ? ["The owner-entered maximum is above every supported bid ceiling under these assumptions."] : []),
      ...warnings,
    ];
    return Object.freeze({
      methodologyVersion: ANALYSIS_METHODOLOGY.AUCTION,
      lotIdentity: rawInput.lotIdentity || null,
      provider: rawInput.provider || null,
      externalIdentity: rawInput.externalIdentity || null,
      url: rawInput.url || null,
      currentBid,
      currentBidCostBreakdown: Object.freeze(currentCost),
      currentTotalAcquisitionCost: currentCost.total,
      expectedLotValue,
      likelySellableValue: expectedLotValue,
      expectedSellingFees: sellingFee.amount,
      expectedNetProceeds,
      targetAcquisitionPrice: null,
      maximumRecommendedBid: null,
      maximumBidCostBreakdown: null,
      profitAtMaximumBid: null,
      roiAtMaximumBidBasisPoints: null,
      ownerEnteredMaximum,
      timeRemaining: rawInput.timeRemaining || null,
      lotContents: Object.freeze(Array.isArray(rawInput.lotContents) ? [...rawInput.lotContents] : []),
      unknownContentsCount: Math.max(0, Number(rawInput.unknownContentsCount || 0)),
      riskFlags: Object.freeze([
        ...(Array.isArray(rawInput.riskFlags) ? rawInput.riskFlags : []),
        ...(currentBid.minorUnits > 0 ? ["CURRENT_BID_ABOVE_SUPPORTED_CEILING"] : []),
        ...(ownerEnteredMaximum?.minorUnits > 0 ? ["OWNER_MAXIMUM_ABOVE_SUPPORTED_CEILING"] : []),
      ]),
      confidence: INTELLIGENCE_CONFIDENCE.INSUFFICIENT,
      downside: null,
      warnings: Object.freeze(infeasibleWarnings),
      explanation: "No maximum bid is proposed because expected net proceeds cannot support the configured profit and ROI targets at a positive acquisition cost.",
      assumptions: Object.freeze({
        buyerPremiumBasisPoints: input.buyerPremiumBasisPoints,
        taxMode: input.taxMode,
        taxBasisPoints: input.taxBasisPoints,
        targetRoiBasisPoints,
        sellingFeeBasisPoints,
        minimumProfit,
      }),
      advisoryOnly: true,
      automaticBidAllowed: false,
    });
  }
  const maximumCost = totalAtBid(maximumRecommendedBid, input, fixedAcquisitionCosts);
  const profitAtMaximum = subtractMoney(expectedNetProceeds, maximumCost.total);
  const roiAtMaximum = calculateRatioBasisPoints(profitAtMaximum, maximumCost.total, "auctionRoiAtMaximum");
  let downside = null;
  if (conservativeLotValue) {
    const downsideFee = calculateBasisPointAmount(conservativeLotValue, sellingFeeBasisPoints, { field: "sellingFeeBasisPoints" });
    const downsideNet = subtractMoney(conservativeLotValue, addMoney([downsideFee.amount, sellingFixedCosts]));
    downside = Object.freeze({
      lotValue: conservativeLotValue,
      netProceeds: downsideNet,
      profitAtRecommendedBid: subtractMoney(downsideNet, maximumCost.total),
    });
  }
  const confidence = Object.values(INTELLIGENCE_CONFIDENCE).includes(rawInput.confidence)
    ? rawInput.confidence
    : INTELLIGENCE_CONFIDENCE.LOW;
  if (confidence === INTELLIGENCE_CONFIDENCE.LOW || confidence === INTELLIGENCE_CONFIDENCE.INSUFFICIENT) {
    warnings.push("Low-confidence lot evidence requires owner review before relying on the bid ceiling.");
  }
  const riskFlags = Array.isArray(rawInput.riskFlags) ? [...rawInput.riskFlags] : [];
  if (currentBid.minorUnits > maximumRecommendedBid.minorUnits) {
    warnings.push("The current bid exceeds the maximum recommended bid under these assumptions.");
    riskFlags.push("CURRENT_BID_ABOVE_RECOMMENDED_MAXIMUM");
  }
  if (ownerEnteredMaximum && ownerEnteredMaximum.minorUnits > maximumRecommendedBid.minorUnits) {
    warnings.push("The owner-entered maximum exceeds the maximum recommended bid under these assumptions.");
    riskFlags.push("OWNER_MAXIMUM_ABOVE_RECOMMENDED_MAXIMUM");
  }

  return Object.freeze({
    methodologyVersion: ANALYSIS_METHODOLOGY.AUCTION,
    lotIdentity: rawInput.lotIdentity || null,
    provider: rawInput.provider || null,
    externalIdentity: rawInput.externalIdentity || null,
    url: rawInput.url || null,
    currentBid,
    currentBidCostBreakdown: Object.freeze(currentCost),
    currentTotalAcquisitionCost: currentCost.total,
    expectedLotValue,
    likelySellableValue: expectedLotValue,
    expectedSellingFees: sellingFee.amount,
    expectedNetProceeds,
    targetAcquisitionPrice: maximumCost.total,
    maximumRecommendedBid,
    maximumBidCostBreakdown: Object.freeze(maximumCost),
    profitAtMaximumBid: profitAtMaximum,
    roiAtMaximumBidBasisPoints: roiAtMaximum,
    ownerEnteredMaximum,
    timeRemaining: rawInput.timeRemaining || null,
    lotContents: Object.freeze(Array.isArray(rawInput.lotContents) ? [...rawInput.lotContents] : []),
    unknownContentsCount: Math.max(0, Number(rawInput.unknownContentsCount || 0)),
    riskFlags: Object.freeze([...new Set(riskFlags)]),
    confidence,
    downside,
    warnings: Object.freeze(warnings),
    explanation: `The ${formatMoneyForExplanation(maximumRecommendedBid)} maximum bid is the highest bid that preserves at least ${formatMoneyForExplanation(minimumProfit)} profit and ${(targetRoiBasisPoints / 100).toFixed(2)}% ROI after buyer premium, ${AUCTION_TAX_EXPLANATION[input.taxMode]}, shipping/pickup, labor, disposal, and selling costs.`,
    assumptions: Object.freeze({
      buyerPremiumBasisPoints: input.buyerPremiumBasisPoints,
      taxMode: input.taxMode,
      taxBasisPoints: input.taxBasisPoints,
      targetRoiBasisPoints,
      sellingFeeBasisPoints,
      minimumProfit,
    }),
    advisoryOnly: true,
    automaticBidAllowed: false,
  });
}
