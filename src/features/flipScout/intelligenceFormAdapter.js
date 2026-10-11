import {
  AUCTION_TAX_MODE,
  CARD_CONDITION,
  EVIDENCE_PROVENANCE,
  IMAGE_SIDE,
  INTELLIGENCE_CONFIDENCE,
  LOT_ITEM_CERTAINTY,
  VALUE_EVIDENCE_TYPE,
  addMoney,
  analyzeMultiItemLot,
  analyzeAuctionIntelligence,
  createMoney,
  formatMoneyForDisplay,
  minorUnitsToMajorString,
  normalizeCardAnalysisInput,
  parseMajorMoney,
} from "../intelligence/index.js";
import { normalizeEbayActiveListingEvidence } from "../intelligence/providerAdapters/ebayEvidence.js";

const CURRENCY = "USD";

function text(value) {
  return String(value ?? "").trim();
}

export function stableOwnerObservationId(observation, occurrence = 1) {
  const semanticValue = [
    observation?.defectType,
    observation?.severity,
    observation?.side,
    observation?.quantity,
    observation?.location,
    observation?.structuralDamage,
    observation?.confidence,
    observation?.note,
    occurrence,
  ].map(text).join("|");
  let hash = 2_166_136_261;
  for (const character of semanticValue) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619) >>> 0;
  }
  return `owner-observation-${hash.toString(16).padStart(8, "0")}`;
}

export function nextOwnerObservationId(observation, existingObservations = []) {
  const used = new Set((Array.isArray(existingObservations) ? existingObservations : []).map((entry) => text(entry?.observationId)).filter(Boolean));
  for (let occurrence = 1; occurrence <= 100_001; occurrence += 1) {
    const candidate = stableOwnerObservationId(observation, occurrence);
    if (!used.has(candidate)) return candidate;
  }
  throw new Error("No unique owner observation identifier is available within the supported record limit.");
}

export function minorMoneyToMajorInput(value) {
  const minorUnits = Number(value?.minorUnits ?? value?.amountMinor);
  if (!Number.isSafeInteger(minorUnits)) return "";
  return minorUnitsToMajorString(minorUnits);
}

export function confidenceValue(value, fallback = INTELLIGENCE_CONFIDENCE.LOW) {
  const normalized = text(value).toUpperCase();
  return Object.values(INTELLIGENCE_CONFIDENCE).includes(normalized) ? normalized : fallback;
}

export function optionalMoney(value, field) {
  const normalized = text(value);
  return normalized ? parseMajorMoney(normalized, { field, currency: CURRENCY }) : null;
}

export function percentageToBasisPoints(value, field) {
  const normalized = text(value);
  if (!normalized) return 0;
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) throw new Error(`${field} must have no more than two decimal places.`);
  const basisPoints = (Number(match[1]) * 100) + Number((match[2] || "").padEnd(2, "0"));
  if (!Number.isSafeInteger(basisPoints) || basisPoints < 0 || basisPoints > 100_000) {
    throw new Error(`${field} is outside the supported range.`);
  }
  return basisPoints;
}

function optionalPercentageToBasisPoints(value, field) {
  return text(value) ? percentageToBasisPoints(value, field) : undefined;
}

function zeroMoney() {
  return createMoney(0, CURRENCY);
}

function sumOptionalMoney(entries, field) {
  const present = entries.map(([value, entryField]) => optionalMoney(value, entryField)).filter(Boolean);
  return present.length ? addMoney(present, { field }) : zeroMoney();
}

function imageReference(reference, side, quality, effects) {
  if (!text(reference)) return null;
  return {
    imageId: `owner-${side.toLowerCase()}`,
    reference: text(reference),
    side,
    quality: confidenceValue(quality, INTELLIGENCE_CONFIDENCE.MEDIUM),
    provenance: EVIDENCE_PROVENANCE.OWNER_ENTERED,
    effects,
  };
}

function parseComparableLines(value, verified) {
  return text(value).split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line, index) => {
    const [amountText, soldAt = "", sourceId = "", conditionText = ""] = line.split("|").map((part) => part.trim());
    if (verified && !sourceId) {
      throw new Error(`completedSales[${index}].sourceReference is required for a verified completed sale.`);
    }
    const condition = text(conditionText).toUpperCase();
    if (condition && !Object.values(CARD_CONDITION).includes(condition)) {
      throw new Error(`completedSales[${index}].condition must be NM, LP, MP, HP, or DMG.`);
    }
    const sourceReference = sourceId || "owner-unattributed-comparable";
    return {
      evidenceId: `owner-sold-${index + 1}`,
      type: VALUE_EVIDENCE_TYPE.SOLD_COMPARABLE,
      amount: parseMajorMoney(amountText, { field: `completedSales[${index}].amount`, currency: CURRENCY }),
      shipping: null,
      soldAt: soldAt || null,
      observedAt: null,
      sourceId: sourceReference,
      underlyingSourceId: sourceReference,
      sourceQuality: verified ? INTELLIGENCE_CONFIDENCE.MEDIUM : INTELLIGENCE_CONFIDENCE.LOW,
      condition: condition || null,
      verifiedCompletedSale: Boolean(verified),
      notes: verified ? "Owner marked this reference as a verified completed sale." : "Completed-sale status has not been verified.",
    };
  });
}

export function selectVerifiedStoredComparables(valuationEvidence) {
  return (Array.isArray(valuationEvidence) ? valuationEvidence : []).filter((entry) => (
    entry?.type === VALUE_EVIDENCE_TYPE.SOLD_COMPARABLE
    && entry?.verifiedCompletedSale === true
    && text(entry?.sourceId)
  ));
}

function ebayEvidence(form) {
  // Marketplace text is owner-editable and cannot establish provider trust.
  // Only records explicitly produced by the existing eBay provider path use
  // the provider adapter, and missing currency remains honestly missing.
  if (String(form.providerId || "").toLowerCase() !== "ebay") return null;
  return normalizeEbayActiveListingEvidence(form);
}

function buildValuationEvidence(form, providerEvidence) {
  const evidence = Array.isArray(form.valuationEvidence) ? [...form.valuationEvidence] : [];
  evidence.push(...(providerEvidence?.valuationEvidence?.activeListings || []));
  evidence.push(...parseComparableLines(form.completedSalesText, form.completedSalesVerified));
  const expected = optionalMoney(form.expectedResaleMidpoint, "expectedResaleMidpoint");
  if (expected) {
    evidence.push({
      evidenceId: "owner-expected-resale",
      type: VALUE_EVIDENCE_TYPE.PREDICTED_RESALE,
      amount: expected,
      shipping: null,
      observedAt: null,
      sourceId: "owner-assumption",
      underlyingSourceId: "owner-assumption",
      sourceQuality: INTELLIGENCE_CONFIDENCE.MEDIUM,
      verifiedCompletedSale: false,
      notes: "Owner-entered resale assumption; not a completed sale.",
    });
  }
  return evidence;
}

export function buildCardAnalysisInput(form) {
  const providerEvidence = ebayEvidence(form);
  const images = [
    imageReference(form.frontImageReference, IMAGE_SIDE.FRONT, form.frontImageQuality, {
      glare: Boolean(form.frontGlare),
      sleeve: Boolean(form.frontSleeve),
      toploader: Boolean(form.frontToploader),
      blur: Boolean(form.frontBlur),
      lowResolution: Boolean(form.frontLowResolution),
      cropped: Boolean(form.frontCropped),
    }),
    imageReference(form.backImageReference, IMAGE_SIDE.BACK, form.backImageQuality, {
      glare: Boolean(form.backGlare),
      sleeve: Boolean(form.backSleeve),
      toploader: Boolean(form.backToploader),
      blur: Boolean(form.backBlur),
      lowResolution: Boolean(form.backLowResolution),
      cropped: Boolean(form.backCropped),
    }),
    ...(providerEvidence?.imageReferences || []).map((image, index) => ({
      imageId: `ebay-image-${index + 1}`,
      reference: image.url,
      side: IMAGE_SIDE.UNKNOWN,
      quality: INTELLIGENCE_CONFIDENCE.LOW,
      provenance: EVIDENCE_PROVENANCE.PROVIDER_SUPPLIED,
      effects: {},
    })),
  ].filter(Boolean);
  const expectedResaleValue = optionalMoney(form.expectedResaleMidpoint, "expectedResaleMidpoint");
  const askingPrice = optionalMoney(form.purchasePrice, "purchasePrice");
  const dealAssumptions = askingPrice ? {
    askingPrice,
    expectedResaleValue,
    purchaseShipping: optionalMoney(form.purchaseShipping, "purchaseShipping") || zeroMoney(),
    purchaseTax: optionalMoney(form.purchaseTax, "purchaseTax") || zeroMoney(),
    acquisitionFees: sumOptionalMoney([
      [form.buyerPremium, "buyerPremium"],
      [form.fixedBuyerFees, "fixedBuyerFees"],
      [form.preparationCost, "preparationCost"],
      [form.otherAcquisitionCosts, "otherAcquisitionCosts"],
    ], "acquisitionFees"),
    travelCost: optionalMoney(form.travelOrPickupCost, "travelOrPickupCost") || zeroMoney(),
    sellingFeeBasisPoints: optionalPercentageToBasisPoints(form.sellingFeePercentage, "sellingFeePercentage"),
    fixedSellingFees: sumOptionalMoney([
      [form.fixedSellingFees, "fixedSellingFees"],
      [form.otherSellingCosts, "otherSellingCosts"],
    ], "fixedSellingCosts"),
    outboundShipping: optionalMoney(form.outboundShipping, "outboundShipping") || zeroMoney(),
    packagingCost: optionalMoney(form.packagingCost, "packagingCost") || zeroMoney(),
    returnReserve: optionalMoney(form.returnOrFraudReserve, "returnOrFraudReserve") || zeroMoney(),
    minimumProfit: optionalMoney(form.minimumDesiredProfit, "minimumDesiredProfit") || createMoney(2_000, CURRENCY),
    minimumRoiBasisPoints: optionalPercentageToBasisPoints(form.minimumDesiredRoi, "minimumDesiredRoi"),
    confidence: confidenceValue(form.confidence),
    taxKnown: text(form.purchaseTax) !== "",
    risks: text(form.riskNotes).split(/[,\n]/).map((value) => value.trim()).filter(Boolean).map((explanation, index) => ({
      code: `OWNER_RISK_${index + 1}`,
      severity: ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(text(form.riskSeverity).toUpperCase())
        ? text(form.riskSeverity).toUpperCase()
        : "MEDIUM",
      explanation,
    })),
  } : null;
  return normalizeCardAnalysisInput({
    identity: {
      productName: form.title,
      set: form.cardSet,
      cardNumber: form.cardNumber,
      language: form.cardLanguage,
      variant: form.cardVariant,
      printingOrEdition: form.printingOrEdition,
      format: form.cardFormat || "UNKNOWN",
      gradingCompany: form.gradingCompany,
      grade: form.grade,
      certificationNumber: form.certificationNumber,
      // The identity fields remain editable owner input. Provider fields are
      // retained separately below with their own provenance.
      source: EVIDENCE_PROVENANCE.OWNER_ENTERED,
      confidence: confidenceValue(form.identityConfidence || form.confidence, INTELLIGENCE_CONFIDENCE.INSUFFICIENT),
    },
    images,
    observations: Array.isArray(form.defectObservations) ? form.defectObservations : [],
    sourceEvidence: providerEvidence ? [{
      adapterVersion: providerEvidence.adapterVersion,
      providerId: providerEvidence.providerId,
      sourceId: providerEvidence.sourceId,
      sourceKind: providerEvidence.sourceKind,
      listingState: providerEvidence.listingState,
      observedAt: providerEvidence.observedAt,
      provenance: EVIDENCE_PROVENANCE.PROVIDER_SUPPLIED,
      externalIdentity: providerEvidence.externalIdentity,
      observations: providerEvidence.observations,
      warnings: providerEvidence.warnings,
      limitations: providerEvidence.limitations,
    }] : [],
    inspectionComplete: Boolean(form.inspectionComplete),
    // System analysis remains independent. Owner confirmations and manual
    // values are recorded through the append-only owner-review path.
    ownerCorrections: {},
    valuationEvidence: buildValuationEvidence(form, providerEvidence),
    dealAssumptions,
    sourceReference: form.listingUrl,
    warnings: providerEvidence ? [
      ...providerEvidence.limitations,
      ...providerEvidence.warnings.map((warning) => `${warning.code}: ${warning.message}`),
    ] : [],
  });
}

const TAX_MODE_MAP = Object.freeze({
  hammer: AUCTION_TAX_MODE.HAMMER_ONLY,
  hammer_plus_premium: AUCTION_TAX_MODE.HAMMER_PLUS_PREMIUM,
  manual: AUCTION_TAX_MODE.MANUAL_TAXABLE_SUBTOTAL,
});

function booleanToken(value) {
  return /^(1|true|yes|y)$/i.test(text(value));
}

function parseLotItemLines(value) {
  return text(value).split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line, index) => {
    const [certaintyText, label, quantityText, conservativeText, expectedText, optimisticText, sellThroughText, conditionUncertainText, duplicateText] = line.split("|").map((part) => part.trim());
    const certainty = text(certaintyText).toUpperCase();
    if (!Object.values(LOT_ITEM_CERTAINTY).includes(certainty)) {
      throw new Error(`lotItemEstimates[${index}].certainty must be identified, probable, or unknown.`);
    }
    const quantity = Number(quantityText || 1);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100_000) {
      throw new Error(`lotItemEstimates[${index}].quantity must be a positive whole number.`);
    }
    const sellThroughBasisPoints = text(sellThroughText)
      ? percentageToBasisPoints(sellThroughText, `lotItemEstimates[${index}].sellThroughPercentage`)
      : undefined;
    return {
      itemId: `owner-lot-item-${index + 1}`,
      label: label || "Unidentified item",
      certainty,
      quantity,
      conservativeValueEach: optionalMoney(conservativeText, `lotItemEstimates[${index}].conservativeValueEach`) || zeroMoney(),
      expectedValueEach: optionalMoney(expectedText, `lotItemEstimates[${index}].expectedValueEach`) || zeroMoney(),
      optimisticValueEach: optionalMoney(optimisticText, `lotItemEstimates[${index}].optimisticValueEach`) || zeroMoney(),
      ...(sellThroughBasisPoints === undefined ? {} : { sellThroughBasisPoints }),
      conditionUncertain: booleanToken(conditionUncertainText),
      duplicate: booleanToken(duplicateText),
      confidence: certainty === LOT_ITEM_CERTAINTY.IDENTIFIED
        ? INTELLIGENCE_CONFIDENCE.MEDIUM
        : INTELLIGENCE_CONFIDENCE.LOW,
      sourceId: "owner-lot-observation",
      underlyingSourceId: "owner-lot-observation",
    };
  });
}

function deriveAuctionConfidence({ expectedLotValue, conservativeLotValue, unknownContentsCount, riskLevel, lotAnalysis, valuationUsesStructuredLot }) {
  if (!expectedLotValue) return INTELLIGENCE_CONFIDENCE.INSUFFICIENT;
  if (unknownContentsCount > 0 || /high|severe|unknown/i.test(text(riskLevel))) return INTELLIGENCE_CONFIDENCE.LOW;
  if (!valuationUsesStructuredLot) return INTELLIGENCE_CONFIDENCE.LOW;
  if (!lotAnalysis || !conservativeLotValue) return INTELLIGENCE_CONFIDENCE.LOW;
  return [INTELLIGENCE_CONFIDENCE.HIGH, INTELLIGENCE_CONFIDENCE.MEDIUM].includes(lotAnalysis.confidence.band)
    ? INTELLIGENCE_CONFIDENCE.MEDIUM
    : INTELLIGENCE_CONFIDENCE.LOW;
}

export function analyzeAuctionForm(form) {
  const currentBid = optionalMoney(form.currentBid, "currentBid") || zeroMoney();
  const taxKnown = text(form.taxRate) !== "";
  const unknownContentsCount = Number(form.unknownContentsCount || 0);
  if (!Number.isSafeInteger(unknownContentsCount) || unknownContentsCount < 0 || unknownContentsCount > 100_000) {
    throw new Error("unknownContentsCount must be a non-negative whole number no greater than 100000.");
  }
  const structuredItems = parseLotItemLines(form.lotItemEstimatesText);
  if (unknownContentsCount > 0) {
    structuredItems.push({
      itemId: "owner-unidentified-contents",
      label: "Unidentified contents",
      certainty: LOT_ITEM_CERTAINTY.UNKNOWN,
      quantity: unknownContentsCount,
      confidence: INTELLIGENCE_CONFIDENCE.INSUFFICIENT,
      sourceId: "owner-lot-observation",
      underlyingSourceId: "owner-lot-observation",
    });
  }
  const lotAnalysis = structuredItems.length ? analyzeMultiItemLot({
    items: structuredItems,
    ownerBulkValue: optionalMoney(form.unknownContentsBulkValue, "unknownContentsBulkValue"),
    currency: CURRENCY,
  }) : null;
  const structuredExpectedValue = lotAnalysis?.scenarios.expected.netValue?.minorUnits > 0
    ? lotAnalysis.scenarios.expected.netValue
    : null;
  const structuredConservativeValue = lotAnalysis?.scenarios.conservative.netValue?.minorUnits > 0
    ? lotAnalysis.scenarios.conservative.netValue
    : null;
  const expectedLotValue = structuredExpectedValue || optionalMoney(form.estimatedResaleMid, "estimatedResaleMid");
  const conservativeLotValue = structuredConservativeValue || optionalMoney(form.estimatedResaleLow, "estimatedResaleLow");
  const confidence = deriveAuctionConfidence({ expectedLotValue, conservativeLotValue, unknownContentsCount, riskLevel: form.riskLevel, lotAnalysis, valuationUsesStructuredLot: Boolean(structuredExpectedValue) });
  const auctionResult = analyzeAuctionIntelligence({
    lotIdentity: { title: text(form.title), type: text(form.auctionType) },
    provider: text(form.source) || "Manual auction entry",
    url: text(form.url) || null,
    currentBid,
    expectedLotValue,
    conservativeLotValue,
    buyerPremiumBasisPoints: percentageToBasisPoints(form.buyerPremiumPercentage, "buyerPremiumPercentage"),
    shipping: optionalMoney(form.purchaseShipping, "purchaseShipping") || zeroMoney(),
    pickupTravel: optionalMoney(form.estimatedTravelCost, "estimatedTravelCost") || zeroMoney(),
    fixedFees: optionalMoney(form.fixedFees, "fixedFees") || zeroMoney(),
    labor: optionalMoney(form.estimatedLaborCost, "estimatedLaborCost") || zeroMoney(),
    disposal: optionalMoney(form.estimatedDisposalCost, "estimatedDisposalCost") || zeroMoney(),
    taxMode: taxKnown ? (TAX_MODE_MAP[form.taxBase] || AUCTION_TAX_MODE.HAMMER_PLUS_PREMIUM) : AUCTION_TAX_MODE.NONE,
    taxBasisPoints: percentageToBasisPoints(form.taxRate, "taxRate"),
    manualTaxableSubtotal: optionalMoney(form.manualTaxableSubtotal, "manualTaxableSubtotal") || zeroMoney(),
    sellingFeeBasisPoints: optionalPercentageToBasisPoints(form.sellingFeePercentage, "sellingFeePercentage"),
    sellingFixedCosts: sumOptionalMoney([
      [form.fixedSellingFees, "fixedSellingFees"],
      [form.outboundShipping, "outboundShipping"],
      [form.packagingCost, "packagingCost"],
    ], "auctionSellingFixedCosts"),
    minimumProfit: optionalMoney(form.desiredProfit, "desiredProfit") || createMoney(2_000, CURRENCY),
    targetRoiBasisPoints: optionalPercentageToBasisPoints(form.desiredRoi, "desiredRoi"),
    ownerEnteredMaximum: optionalMoney(form.myMaximumBid, "myMaximumBid"),
    confidence,
    unknownContentsCount,
    lotContents: text(form.lotContentsText).split(/\r?\n/).map((value) => value.trim()).filter(Boolean),
    riskFlags: text(form.notes).split(/\r?\n/).map((value) => value.trim()).filter(Boolean),
    timeRemaining: form.endDateTime || null,
    taxKnown,
  });
  return Object.freeze({
    ...auctionResult,
    lotAnalysis,
    valuationBasis: structuredExpectedValue ? "STRUCTURED_LOT_ANALYSIS" : expectedLotValue ? "OWNER_MIDPOINT_ASSUMPTION" : "UNAVAILABLE",
  });
}

export function formatMinorMoney(value, empty = "Not enough data") {
  if (!value || !Number.isSafeInteger(value.minorUnits) || !value.currency) return empty;
  return formatMoneyForDisplay(value);
}

export function formatBasisPoints(value, empty = "Not enough data") {
  return Number.isSafeInteger(value) ? `${(value / 100).toFixed(2)}%` : empty;
}
