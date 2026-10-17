const MONEY_KEYS = {
  acquisition: [
    "purchasePrice",
    "purchaseShipping",
    "purchaseTax",
    "buyerPremium",
    "fixedBuyerFees",
    "travelOrPickupCost",
    "preparationCost",
    "otherAcquisitionCosts",
  ],
  selling: [
    "fixedSellingFees",
    "outboundShipping",
    "packagingCost",
    "returnOrFraudReserve",
    "otherSellingCosts",
  ],
};

export function safeNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = typeof value === "string" ? Number(value.replace(/[$,%\s,]/g, "")) : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function nonNegative(value, fallback = 0) {
  return Math.max(0, safeNumber(value, fallback));
}

export function percentRate(value) {
  return Math.min(1, nonNegative(value) / 100);
}

export function roundMoney(value) {
  const parsed = safeNumber(value, 0);
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
}

export function calculateLandedCost(input = {}) {
  return MONEY_KEYS.acquisition.reduce((total, key) => total + nonNegative(input[key]), 0);
}

export function calculateExpectedNetProceeds(input = {}) {
  const resale = nonNegative(input.expectedResalePrice);
  const percentageSellingFees = resale * percentRate(input.sellingFeePercentage);
  const fixedSellingCosts = MONEY_KEYS.selling.reduce((total, key) => total + nonNegative(input[key]), 0);
  return resale - percentageSellingFees - fixedSellingCosts;
}

export function calculateExpectedProfit(input = {}) {
  return calculateExpectedNetProceeds(input) - calculateLandedCost(input);
}

export function calculateRoi(profit, landedCost) {
  const safeCost = nonNegative(landedCost);
  if (safeCost <= 0) return null;
  const result = safeNumber(profit) / safeCost;
  return Number.isFinite(result) ? result : null;
}

export function calculateBreakEvenResalePrice(input = {}) {
  const feeRate = percentRate(input.sellingFeePercentage);
  if (feeRate >= 1) return null;
  const landedCost = calculateLandedCost(input);
  const fixedSellingCosts = MONEY_KEYS.selling.reduce((total, key) => total + nonNegative(input[key]), 0);
  const result = (landedCost + fixedSellingCosts) / (1 - feeRate);
  return Number.isFinite(result) ? Math.max(0, result) : null;
}

export function calculateMaximumPurchasePrice(input = {}) {
  const expectedNetProceeds = calculateExpectedNetProceeds(input);
  const targetRoi = percentRate(input.minimumDesiredRoi);
  const minimumProfit = nonNegative(input.minimumDesiredProfit);
  const allowableByRoi = expectedNetProceeds / (1 + targetRoi);
  const allowableByProfit = expectedNetProceeds - minimumProfit;
  const maximumLandedCost = Math.max(0, Math.min(allowableByRoi, allowableByProfit));
  const otherAcquisitionCosts = MONEY_KEYS.acquisition
    .filter((key) => key !== "purchasePrice")
    .reduce((total, key) => total + nonNegative(input[key]), 0);
  const maximumBasePurchasePrice = Math.max(0, maximumLandedCost - otherAcquisitionCosts);
  return {
    expectedNetProceeds,
    allowableByRoi,
    allowableByProfit,
    maximumLandedCost,
    otherAcquisitionCosts,
    maximumBasePurchasePrice,
    maximumRecommendedOffer: maximumBasePurchasePrice,
  };
}

function scenario(input, expectedResalePrice) {
  const scenarioInput = { ...input, expectedResalePrice };
  const netProceeds = calculateExpectedNetProceeds(scenarioInput);
  const landedCost = calculateLandedCost(scenarioInput);
  const profit = netProceeds - landedCost;
  return { expectedResalePrice: nonNegative(expectedResalePrice), netProceeds, profit, roi: calculateRoi(profit, landedCost) };
}

export function analyzeListing(input = {}) {
  const landedCost = calculateLandedCost(input);
  const low = scenario(input, input.expectedResaleLow);
  const midpoint = scenario(input, input.expectedResaleMidpoint);
  const high = scenario(input, input.expectedResaleHigh);
  const maximum = calculateMaximumPurchasePrice({ ...input, expectedResalePrice: input.expectedResaleMidpoint });
  const minimumProfit = nonNegative(input.minimumDesiredProfit);
  const minimumRoi = percentRate(input.minimumDesiredRoi);
  const meetsProfit = midpoint.profit >= minimumProfit;
  const meetsRoi = midpoint.roi !== null && midpoint.roi >= minimumRoi;
  const hasRequiredInformation = nonNegative(input.purchasePrice) > 0 && midpoint.expectedResalePrice > 0;
  const riskFlags = Array.isArray(input.riskFlags)
    ? input.riskFlags.filter(Boolean)
    : String(input.riskNotes || "").split(/[,\n]/).map((value) => value.trim()).filter(Boolean);
  let label = "Insufficient Information";
  if (hasRequiredInformation) {
    if (meetsProfit && meetsRoi) {
      const exceptionalRoi = midpoint.roi !== null && midpoint.roi >= Math.max(0.5, minimumRoi * 2);
      const exceptionalProfit = midpoint.profit >= Math.max(50, minimumProfit * 2);
      label = exceptionalRoi && exceptionalProfit ? "Exceptional Deal" : "Strong Buy";
    } else if (maximum.maximumRecommendedOffer > 0 && nonNegative(input.purchasePrice) > maximum.maximumBasePurchasePrice) {
      label = "Worth an Offer";
    } else if (midpoint.profit >= 0) {
      label = "Fair Price";
    } else {
      label = "Pass";
    }
  }

  const explanation = !hasRequiredInformation
    ? "Add a positive asking price and midpoint resale estimate before relying on the result."
    : meetsProfit && meetsRoi
      ? `At the midpoint assumption, the listing clears both the ${minimumProfit.toFixed(2)} minimum-profit rule and ${(minimumRoi * 100).toFixed(1)}% minimum-ROI rule.`
      : `At the midpoint assumption, the listing ${meetsProfit ? "meets" : "does not meet"} the profit rule and ${meetsRoi ? "meets" : "does not meet"} the ROI rule. The offer ceiling uses the stricter rule.`;

  return {
    label,
    landedCost,
    low,
    midpoint,
    high,
    breakEvenResalePrice: calculateBreakEvenResalePrice(input),
    ...maximum,
    meetsProfit,
    meetsRoi,
    meetsBoth: meetsProfit && meetsRoi,
    confidence: input.confidence || "Low",
    riskFlags,
    explanation,
  };
}

export function calculateMaximumAuctionBid(input = {}) {
  const expectedNetProceeds = calculateExpectedNetProceeds({
    expectedResalePrice: input.expectedResalePrice ?? input.estimatedResaleMid,
    sellingFeePercentage: input.sellingFeePercentage,
    fixedSellingFees: input.fixedSellingFees,
    outboundShipping: input.outboundShipping,
    packagingCost: input.packagingCost,
    returnOrFraudReserve: input.returnOrFraudReserve,
    otherSellingCosts: input.otherSellingCosts,
  });
  const desiredRoi = percentRate(input.desiredRoi ?? input.minimumDesiredRoi);
  const desiredProfit = nonNegative(input.desiredProfit ?? input.minimumDesiredProfit);
  const maximumTotalAcquisitionCost = Math.max(0, Math.min(
    expectedNetProceeds / (1 + desiredRoi),
    expectedNetProceeds - desiredProfit,
  ));
  const premiumRate = percentRate(input.buyerPremiumPercentage);
  const taxRate = percentRate(input.taxRate);
  const fixedCosts = ["fixedFees", "estimatedTravelCost", "estimatedLaborCost", "estimatedDisposalCost", "otherAcquisitionCosts"]
    .reduce((total, key) => total + nonNegative(input[key]), 0);
  const taxBase = input.taxBase || "hammer_plus_premium";
  let variableFactor = 1 + premiumRate;
  let fixedTax = 0;
  if (taxBase === "hammer") variableFactor += taxRate;
  if (taxBase === "hammer_plus_premium") variableFactor = (1 + premiumRate) * (1 + taxRate);
  if (taxBase === "manual") fixedTax = nonNegative(input.manualTaxableSubtotal) * taxRate;
  const maximumHammerBid = Math.max(0, (maximumTotalAcquisitionCost - fixedCosts - fixedTax) / variableFactor);
  const buyerPremiumAtMaximum = maximumHammerBid * premiumRate;
  const taxableSubtotal = taxBase === "manual"
    ? nonNegative(input.manualTaxableSubtotal)
    : taxBase === "hammer"
      ? maximumHammerBid
      : maximumHammerBid + buyerPremiumAtMaximum;
  const taxAtMaximum = taxableSubtotal * taxRate;
  const totalCostAtMaximum = maximumHammerBid + buyerPremiumAtMaximum + taxAtMaximum + fixedCosts;
  return {
    expectedNetProceeds,
    desiredRoi,
    desiredProfit,
    maximumTotalAcquisitionCost,
    maximumHammerBid,
    buyerPremiumAtMaximum,
    taxableSubtotal,
    taxAtMaximum,
    fixedCosts,
    totalCostAtMaximum,
    taxBase,
  };
}

export function calculateSaleResults(input = {}) {
  const netProceeds = nonNegative(input.grossSalePrice)
    - nonNegative(input.discounts)
    - nonNegative(input.sellingFees)
    - nonNegative(input.paymentFees)
    + nonNegative(input.shippingChargedToBuyer)
    - nonNegative(input.actualOutboundShipping)
    - nonNegative(input.packaging)
    - nonNegative(input.refunds)
    - nonNegative(input.otherCosts);
  const costOfGoodsSold = nonNegative(input.allocatedCostOfGoodsSold);
  const realizedProfit = netProceeds - costOfGoodsSold;
  return { netProceeds, costOfGoodsSold, realizedProfit, realizedRoi: calculateRoi(realizedProfit, costOfGoodsSold) };
}
