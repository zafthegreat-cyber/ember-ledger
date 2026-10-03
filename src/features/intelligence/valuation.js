import {
  ALL_CARD_CONDITIONS,
  ALL_INTELLIGENCE_CONFIDENCE,
  ALL_VALUE_EVIDENCE_TYPES,
  ANALYSIS_METHODOLOGY,
  CARD_CONDITION,
  INTELLIGENCE_CONFIDENCE,
  VALUE_EVIDENCE_TYPE,
} from "./constants.js";
import { confidenceScore, evaluateConfidence } from "./confidence.js";
import {
  addMoney,
  assertMoney,
  assertSameCurrency,
  calculateBasisPointAmount,
  createMoney,
} from "./money.js";

const CONDITION_ADJUSTMENT_BASIS_POINTS = Object.freeze({
  [CARD_CONDITION.NM]: 10_000,
  [CARD_CONDITION.LP]: 8_500,
  [CARD_CONDITION.MP]: 6_500,
  [CARD_CONDITION.HP]: 4_000,
  [CARD_CONDITION.DMG]: 2_000,
});

const CONDITION_BASIS_MODE = Object.freeze({
  MATCHED_CONDITION: "MATCHED_CONDITION",
  NM_BASELINE_ADJUSTED: "NM_BASELINE_ADJUSTED",
  SUBJECT_CONDITION_UNRESOLVED: "SUBJECT_CONDITION_UNRESOLVED",
  NO_COMPATIBLE_COMPLETED_SALES: "NO_COMPATIBLE_COMPLETED_SALES",
});

function dateValue(value, field) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${field} must be a valid timestamp.`);
  return parsed;
}

function medianMinorUnits(values) {
  if (!values.length) return { value: null, rounding: null };
  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return { value: sorted[midpoint], rounding: null };
  const left = BigInt(sorted[midpoint - 1]);
  const right = BigInt(sorted[midpoint]);
  const numerator = left + right;
  return {
    value: Number((numerator + 1n) / 2n),
    rounding: {
      method: "HALF_UP_TO_MINOR_UNIT",
      exactWhenEven: numerator % 2n === 0n,
      sourceMinorUnits: [sorted[midpoint - 1], sorted[midpoint]],
    },
  };
}

function absoluteMedianDeviation(values, median) {
  return medianMinorUnits(values.map((value) => Math.abs(value - median))).value || 0;
}

function optionalCardCondition(value, field) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const condition = String(value).trim().toUpperCase();
  if (!ALL_CARD_CONDITIONS.includes(condition)) {
    throw new Error(`${field} must be NM, LP, MP, HP, or DMG.`);
  }
  return condition;
}

function sourceQuality(value, field) {
  const quality = value === null || value === undefined || value === ""
    ? INTELLIGENCE_CONFIDENCE.LOW
    : String(value).trim().toUpperCase();
  if (!ALL_INTELLIGENCE_CONFIDENCE.includes(quality)) {
    throw new Error(`${field} must be HIGH, MEDIUM, LOW, or INSUFFICIENT.`);
  }
  return quality;
}

function normalizeEvidence(value, index) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`valuationEvidence[${index}] must be an object.`);
  const type = String(value.type || "").toUpperCase();
  if (!ALL_VALUE_EVIDENCE_TYPES.includes(type)) throw new Error(`valuationEvidence[${index}].type is unsupported.`);
  const amount = assertMoney(value.amount, { field: `valuationEvidence[${index}].amount` });
  const shipping = value.shipping === null || value.shipping === undefined
    ? null
    : assertMoney(value.shipping, { field: `valuationEvidence[${index}].shipping` });
  if (shipping) assertSameCurrency([amount, shipping], `valuationEvidence[${index}]`);
  return Object.freeze({
    evidenceId: String(value.evidenceId || value.id || `value-evidence-${index + 1}`),
    type,
    amount,
    shipping,
    soldAt: dateValue(value.soldAt, `valuationEvidence[${index}].soldAt`)?.toISOString() || null,
    observedAt: dateValue(value.observedAt, `valuationEvidence[${index}].observedAt`)?.toISOString() || null,
    sourceId: String(value.sourceId || "unknown"),
    underlyingSourceId: String(value.underlyingSourceId || value.sourceId || "unknown"),
    sourceQuality: sourceQuality(value.sourceQuality ?? value.confidence, `valuationEvidence[${index}].sourceQuality`),
    condition: optionalCardCondition(value.condition, `valuationEvidence[${index}].condition`),
    included: value.included !== false,
    exclusionReason: value.exclusionReason ? String(value.exclusionReason) : "",
    verifiedCompletedSale: type === VALUE_EVIDENCE_TYPE.SOLD_COMPARABLE && value.verifiedCompletedSale === true,
    notes: value.notes ? String(value.notes) : "",
  });
}

function observationTotal(evidence, shippingTreatment) {
  if (shippingTreatment === "INCLUDE_REPORTED_SHIPPING" && evidence.shipping) {
    return addMoney([evidence.amount, evidence.shipping], { field: `valuationEvidence.${evidence.evidenceId}` });
  }
  return evidence.amount;
}

function statsForEvidence(entries, currency, shippingTreatment) {
  if (!entries.length) return Object.freeze({ count: 0, low: null, median: null, high: null, medianRounding: null });
  const values = entries.map((entry) => observationTotal(entry, shippingTreatment).minorUnits).sort((left, right) => left - right);
  const median = medianMinorUnits(values);
  return Object.freeze({
    count: values.length,
    low: createMoney(values[0], currency),
    median: createMoney(median.value, currency),
    high: createMoney(values[values.length - 1], currency),
    medianRounding: median.rounding,
  });
}

function removeOutliers(entries, shippingTreatment) {
  if (entries.length < 4) return { included: entries, outliers: [], method: "NONE_SMALL_SAMPLE" };
  const values = entries.map((entry) => observationTotal(entry, shippingTreatment).minorUnits);
  const median = medianMinorUnits(values).value;
  const mad = absoluteMedianDeviation(values, median);
  const threshold = Math.max(mad * 3, Math.round(Math.abs(median) * 0.5), 100);
  const included = [];
  const outliers = [];
  entries.forEach((entry, index) => {
    if (Math.abs(values[index] - median) > threshold) outliers.push(entry);
    else included.push(entry);
  });
  if (!included.length) return { included: entries, outliers: [], method: "NONE_ALL_WOULD_BE_EXCLUDED" };
  return { included, outliers, method: "MEDIAN_ABSOLUTE_DEVIATION_WITH_FLOOR", median, mad, threshold };
}

function freshnessFor(entries, asOf) {
  if (!entries.length) return { score: 0, newestAgeDays: null, oldestAgeDays: null };
  const ages = entries.map((entry) => {
    const timestamp = dateValue(entry.soldAt || entry.observedAt, "evidence timestamp");
    if (!timestamp) return null;
    return Math.max(0, Math.floor((asOf.getTime() - timestamp.getTime()) / 86_400_000));
  }).filter((value) => value !== null);
  if (!ages.length) return { score: 0.25, newestAgeDays: null, oldestAgeDays: null };
  const newestAgeDays = Math.min(...ages);
  const oldestAgeDays = Math.max(...ages);
  const score = newestAgeDays <= 30 ? 1 : newestAgeDays <= 90 ? 0.78 : newestAgeDays <= 180 ? 0.5 : 0.25;
  return { score, newestAgeDays, oldestAgeDays };
}

function selectConditionBasis(entries, subjectCondition, requestedAdjustmentBasisPoints) {
  if (!subjectCondition) {
    return {
      mode: CONDITION_BASIS_MODE.SUBJECT_CONDITION_UNRESOLVED,
      entries: [],
      adjustmentBasisPoints: null,
      excluded: entries.map((entry) => ({ evidenceId: entry.evidenceId, reason: "SUBJECT_CONDITION_UNRESOLVED" })),
      explanation: "A condition-specific estimate was not calculated because the subject condition is unresolved.",
    };
  }

  const matched = entries.filter((entry) => entry.condition === subjectCondition);
  if (matched.length) {
    return {
      mode: CONDITION_BASIS_MODE.MATCHED_CONDITION,
      entries: matched,
      adjustmentBasisPoints: 10_000,
      excluded: entries.filter((entry) => entry.condition !== subjectCondition).map((entry) => ({
        evidenceId: entry.evidenceId,
        reason: !entry.condition
          ? "COMPARABLE_CONDITION_UNKNOWN"
          : entry.condition === CARD_CONDITION.NM
            ? "MATCHED_CONDITION_PREFERRED_OVER_NM_BASELINE"
            : "CONDITION_NOT_MATCHED",
      })),
      explanation: `${subjectCondition} completed-sale comparables were used directly without another condition adjustment.`,
    };
  }

  const explicitNmBaseline = entries.filter((entry) => entry.condition === CARD_CONDITION.NM);
  if (explicitNmBaseline.length) {
    return {
      mode: CONDITION_BASIS_MODE.NM_BASELINE_ADJUSTED,
      entries: explicitNmBaseline,
      adjustmentBasisPoints: requestedAdjustmentBasisPoints ?? CONDITION_ADJUSTMENT_BASIS_POINTS[subjectCondition],
      excluded: entries.filter((entry) => entry.condition !== CARD_CONDITION.NM).map((entry) => ({
        evidenceId: entry.evidenceId,
        reason: entry.condition ? "CONDITION_NOT_COMPATIBLE_WITH_NM_BASELINE" : "COMPARABLE_CONDITION_UNKNOWN",
      })),
      explanation: `No ${subjectCondition} completed-sale comparable was available, so explicit NM completed-sale baselines were adjusted once to ${subjectCondition}.`,
    };
  }

  return {
    mode: CONDITION_BASIS_MODE.NO_COMPATIBLE_COMPLETED_SALES,
    entries: [],
    adjustmentBasisPoints: null,
    excluded: entries.map((entry) => ({
      evidenceId: entry.evidenceId,
      reason: entry.condition ? "NO_MATCHED_OR_NM_BASELINE" : "COMPARABLE_CONDITION_UNKNOWN",
    })),
    explanation: `No verified completed-sale comparable has a condition basis compatible with ${subjectCondition}.`,
  };
}

function adjustStatsForCondition(stats, adjustmentBasisPoints) {
  if (!stats.count || adjustmentBasisPoints === null) {
    return Object.freeze({ count: 0, low: null, median: null, high: null, medianRounding: null });
  }
  const adjustedLow = calculateBasisPointAmount(stats.low, adjustmentBasisPoints, {
    field: "conditionAdjustmentBasisPoints",
    maxBasisPoints: 20_000,
  });
  const adjustedMedian = calculateBasisPointAmount(stats.median, adjustmentBasisPoints, {
    field: "conditionAdjustmentBasisPoints",
    maxBasisPoints: 20_000,
  });
  const adjustedHigh = calculateBasisPointAmount(stats.high, adjustmentBasisPoints, {
    field: "conditionAdjustmentBasisPoints",
    maxBasisPoints: 20_000,
  });
  return Object.freeze({
    count: stats.count,
    low: adjustedLow.amount,
    median: adjustedMedian.amount,
    high: adjustedHigh.amount,
    medianRounding: adjustedMedian.rounding,
  });
}

export function buildConditionAwareValuation(input = {}) {
  const evidence = (Array.isArray(input.evidence) ? input.evidence : []).map(normalizeEvidence);
  const currency = assertSameCurrency(
    evidence.flatMap((entry) => [entry.amount, entry.shipping].filter(Boolean)),
    "valuationEvidence",
  ) || String(input.currency || "USD").toUpperCase();
  const shippingTreatment = input.shippingTreatment || "INCLUDE_REPORTED_SHIPPING";
  if (!["INCLUDE_REPORTED_SHIPPING", "EXCLUDE_SHIPPING"].includes(shippingTreatment)) {
    throw new Error("shippingTreatment is unsupported.");
  }
  const asOf = dateValue(input.asOf || new Date().toISOString(), "asOf");
  const condition = optionalCardCondition(input.condition, "condition");
  const requestedAdjustmentBasisPoints = input.conditionAdjustmentBasisPoints;
  if (requestedAdjustmentBasisPoints !== null && requestedAdjustmentBasisPoints !== undefined
    && (!Number.isSafeInteger(requestedAdjustmentBasisPoints) || requestedAdjustmentBasisPoints < 0 || requestedAdjustmentBasisPoints > 20_000)) {
    throw new Error("conditionAdjustmentBasisPoints must be a bounded non-negative integer.");
  }
  const soldCandidates = evidence.filter((entry) => (
    entry.type === VALUE_EVIDENCE_TYPE.SOLD_COMPARABLE
    && entry.included
    && entry.verifiedCompletedSale
  ));
  const unverifiedSold = evidence.filter((entry) => entry.type === VALUE_EVIDENCE_TYPE.SOLD_COMPARABLE && !entry.verifiedCompletedSale);
  const conditionBasis = selectConditionBasis(soldCandidates, condition, requestedAdjustmentBasisPoints);
  const outlierResult = removeOutliers(conditionBasis.entries, shippingTreatment);
  const completedSales = statsForEvidence(outlierResult.included, currency, shippingTreatment);
  const conditionAdjustedCompletedSales = adjustStatsForCondition(completedSales, conditionBasis.adjustmentBasisPoints);
  const activeListings = statsForEvidence(
    evidence.filter((entry) => entry.type === VALUE_EVIDENCE_TYPE.ACTIVE_LISTING && entry.included),
    currency,
    shippingTreatment,
  );
  const referencePrices = statsForEvidence(
    evidence.filter((entry) => entry.type === VALUE_EVIDENCE_TYPE.REFERENCE_PRICE && entry.included),
    currency,
    shippingTreatment,
  );
  const ownerCosts = statsForEvidence(
    evidence.filter((entry) => entry.type === VALUE_EVIDENCE_TYPE.OWNER_COST && entry.included),
    currency,
    shippingTreatment,
  );
  const ownerSales = statsForEvidence(
    evidence.filter((entry) => entry.type === VALUE_EVIDENCE_TYPE.OWNER_SALE && entry.included),
    currency,
    shippingTreatment,
  );
  const predictedResale = statsForEvidence(
    evidence.filter((entry) => entry.type === VALUE_EVIDENCE_TYPE.PREDICTED_RESALE && entry.included),
    currency,
    shippingTreatment,
  );

  const adjustmentBasisPoints = conditionBasis.adjustmentBasisPoints;
  const rawReferenceValue = completedSales.median;
  const freshness = freshnessFor(outlierResult.included, asOf);
  const conditionCoverage = soldCandidates.length ? conditionBasis.entries.length / soldCandidates.length : 0;
  const baseCompleteness = outlierResult.included.length >= 3 ? 0.9 : outlierResult.included.length ? 0.55 : 0.2;
  const confidence = evaluateConfidence({
    sources: outlierResult.included.map((entry) => ({
      sourceId: entry.sourceId,
      underlyingSourceId: entry.underlyingSourceId,
      quality: entry.sourceQuality,
    })),
    sampleSize: outlierResult.included.length,
    freshness: freshness.score,
    identityConfidence: input.identityConfidence || INTELLIGENCE_CONFIDENCE.LOW,
    conditionConfidence: input.conditionConfidence || INTELLIGENCE_CONFIDENCE.LOW,
    completeness: Math.min(baseCompleteness, conditionCoverage || 0.2),
    contradictions: Number(input.contradictions || 0) + unverifiedSold.length,
  });
  const warnings = [];
  if (!soldCandidates.length) warnings.push("No verified completed-sale comparable supports a market estimate.");
  else if (!completedSales.count) warnings.push(conditionBasis.explanation);
  if (activeListings.count) warnings.push("Active asking prices are shown separately and are not treated as completed-sale market value.");
  if (referencePrices.count) warnings.push("Reference or guide prices are shown separately from completed sales.");
  if (unverifiedSold.length) warnings.push(`${unverifiedSold.length} claimed sold comparable${unverifiedSold.length === 1 ? " was" : "s were"} excluded because completed-sale status was not verified.`);
  if (outlierResult.outliers.length) warnings.push(`${outlierResult.outliers.length} statistical outlier${outlierResult.outliers.length === 1 ? " was" : "s were"} excluded from the robust center.`);
  if (shippingTreatment === "INCLUDE_REPORTED_SHIPPING" && soldCandidates.some((entry) => !entry.shipping)) {
    warnings.push("Some comparable records do not report shipping; totals may not be directly comparable.");
  }
  if (!condition) warnings.push("No condition estimate was produced because the subject condition is unresolved.");
  const unknownConditionCount = conditionBasis.excluded.filter((entry) => entry.reason === "COMPARABLE_CONDITION_UNKNOWN").length;
  const lowerPriorityNmCount = conditionBasis.excluded.filter((entry) => entry.reason === "MATCHED_CONDITION_PREFERRED_OVER_NM_BASELINE").length;
  const incompatibleConditionCount = conditionBasis.excluded.length - unknownConditionCount - lowerPriorityNmCount;
  if (unknownConditionCount) warnings.push(`${unknownConditionCount} verified completed-sale comparable${unknownConditionCount === 1 ? " was" : "s were"} excluded because its condition basis is unknown.`);
  if (lowerPriorityNmCount) warnings.push(`${lowerPriorityNmCount} explicit NM baseline comparable${lowerPriorityNmCount === 1 ? " was" : "s were"} excluded because matched-condition sales take priority.`);
  if (incompatibleConditionCount) warnings.push(`${incompatibleConditionCount} verified completed-sale comparable${incompatibleConditionCount === 1 ? " was" : "s were"} excluded because its condition was incompatible with the selected basis.`);
  if (conditionBasis.mode === CONDITION_BASIS_MODE.MATCHED_CONDITION
    && requestedAdjustmentBasisPoints !== null && requestedAdjustmentBasisPoints !== undefined
    && requestedAdjustmentBasisPoints !== 10_000) {
    warnings.push("The custom condition adjustment was ignored because matched-condition comparables must not be adjusted again.");
  }

  const evidenceByType = Object.fromEntries(ALL_VALUE_EVIDENCE_TYPES.map((type) => [
    type,
    Object.freeze(evidence.filter((entry) => entry.type === type)),
  ]));
  return Object.freeze({
    methodologyVersion: ANALYSIS_METHODOLOGY.VALUATION,
    currency,
    asOf: asOf.toISOString(),
    shippingTreatment,
    sourceCoverage: Object.freeze({
      evidenceCount: evidence.length,
      completedSaleCount: completedSales.count,
      verifiedCompletedSaleCount: soldCandidates.length,
      conditionBasisExcludedCount: conditionBasis.excluded.length,
      independentCompletedSaleSources: new Set(outlierResult.included.map((entry) => entry.underlyingSourceId)).size,
      activeListingCount: activeListings.count,
      referencePriceCount: referencePrices.count,
    }),
    evidenceByType: Object.freeze(evidenceByType),
    completedSales,
    activeListings,
    referencePrices,
    ownerCosts,
    ownerSales,
    predictedResale,
    outlierTreatment: Object.freeze({
      method: outlierResult.method,
      excludedEvidenceIds: Object.freeze(outlierResult.outliers.map((entry) => entry.evidenceId)),
      medianMinorUnits: outlierResult.median ?? completedSales.median?.minorUnits ?? null,
      medianAbsoluteDeviationMinorUnits: outlierResult.mad ?? null,
      thresholdMinorUnits: outlierResult.threshold ?? null,
    }),
    freshness: Object.freeze(freshness),
    rawReferenceValue,
    condition,
    conditionAdjustmentBasisPoints: adjustmentBasisPoints,
    conditionBasis: Object.freeze({
      policy: "PREFER_MATCHED_CONDITION_THEN_EXPLICIT_NM_BASELINE",
      mode: conditionBasis.mode,
      subjectCondition: condition,
      sourceCondition: conditionBasis.mode === CONDITION_BASIS_MODE.MATCHED_CONDITION
        ? condition
        : conditionBasis.mode === CONDITION_BASIS_MODE.NM_BASELINE_ADJUSTED ? CARD_CONDITION.NM : null,
      includedEvidenceIds: Object.freeze(outlierResult.included.map((entry) => entry.evidenceId)),
      excludedEvidence: Object.freeze(conditionBasis.excluded.map((entry) => Object.freeze({ ...entry }))),
      explanation: conditionBasis.explanation,
      doubleAdjustmentPrevented: conditionBasis.mode === CONDITION_BASIS_MODE.MATCHED_CONDITION,
    }),
    conditionAdjustedCompletedSales,
    conditionAdjustedValue: conditionAdjustedCompletedSales.median,
    adjustmentRounding: conditionAdjustedCompletedSales.medianRounding,
    low: conditionAdjustedCompletedSales.low,
    high: conditionAdjustedCompletedSales.high,
    sampleSize: completedSales.count,
    confidence,
    warnings: Object.freeze(warnings),
    marketCoverageComplete: completedSales.count >= 3 && confidence.band !== INTELLIGENCE_CONFIDENCE.INSUFFICIENT,
  });
}
