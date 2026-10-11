import {
  ANALYSIS_METHODOLOGY,
  INTELLIGENCE_CONFIDENCE,
  RESTOCK_LIKELIHOOD,
  RESTOCK_OBSERVATION_TYPE,
} from "./constants.js";
import { evaluateConfidence } from "./confidence.js";

const POSITIVE_TYPES = new Set([
  RESTOCK_OBSERVATION_TYPE.STOCK_OBSERVED,
  RESTOCK_OBSERVATION_TYPE.RESTOCK_EVIDENCE,
  RESTOCK_OBSERVATION_TYPE.VISIT_SUCCESS,
]);

function normalizeTimestamp(value, field) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${field} must be a valid timestamp.`);
  return date;
}

function normalizeObservation(value, index) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`observations[${index}] must be an object.`);
  const type = String(value.type || "").toUpperCase();
  if (!Object.values(RESTOCK_OBSERVATION_TYPE).includes(type)) throw new Error(`observations[${index}].type is unsupported.`);
  const confidence = String(value.confidence || INTELLIGENCE_CONFIDENCE.LOW).toUpperCase();
  if (!Object.values(INTELLIGENCE_CONFIDENCE).includes(confidence)) throw new Error(`observations[${index}].confidence is unsupported.`);
  const observedQuantity = value.observedQuantity === null || value.observedQuantity === undefined
    ? null
    : Number(value.observedQuantity);
  if (observedQuantity !== null && (!Number.isFinite(observedQuantity) || observedQuantity < 0)) {
    throw new Error(`observations[${index}].observedQuantity must be a finite non-negative number.`);
  }
  return Object.freeze({
    observationId: String(value.observationId || value.id || `restock-observation-${index + 1}`),
    type,
    storeId: String(value.storeId || ""),
    retailer: String(value.retailer || ""),
    productId: String(value.productId || ""),
    occurredAt: normalizeTimestamp(value.occurredAt, `observations[${index}].occurredAt`).toISOString(),
    observedQuantity,
    sourceId: String(value.sourceId || "unknown"),
    underlyingSourceId: String(value.underlyingSourceId || value.sourceId || value.observationId || `source-${index + 1}`),
    confidence,
    evidence: value.evidence ? String(value.evidence) : "",
  });
}

function timeBand(date) {
  const hour = date.getUTCHours();
  if (hour < 6) return "OVERNIGHT";
  if (hour < 12) return "MORNING";
  if (hour < 17) return "AFTERNOON";
  if (hour < 22) return "EVENING";
  return "OVERNIGHT";
}

function dominantValue(values) {
  if (!values.length) return { value: null, count: 0, ratio: 0 };
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  const entries = [...counts.entries()].sort((left, right) => right[1] - left[1] || String(left[0]).localeCompare(String(right[0])));
  return { value: entries[0][0], count: entries[0][1], ratio: entries[0][1] / values.length };
}

export function analyzeRestockIntelligence(input = {}) {
  const asOf = normalizeTimestamp(input.asOf || new Date().toISOString(), "asOf");
  const all = (Array.isArray(input.observations) ? input.observations : []).map(normalizeObservation);
  const filtered = all.filter((observation) => (
    (!input.storeId || observation.storeId === String(input.storeId))
    && (!input.productId || observation.productId === String(input.productId))
  ));
  const deduplicated = [...new Map(filtered.map((observation) => [
    `${observation.underlyingSourceId}|${observation.type}|${observation.occurredAt}`,
    observation,
  ])).values()];
  const positives = deduplicated.filter((observation) => POSITIVE_TYPES.has(observation.type));
  const contradictory = deduplicated.filter((observation) => (
    observation.type === RESTOCK_OBSERVATION_TYPE.EMPTY_SHELF
    || observation.type === RESTOCK_OBSERVATION_TYPE.VISIT_UNSUCCESSFUL
  ));
  const sortedPositives = [...positives].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
  const lastConfirmedRestock = sortedPositives[0]?.occurredAt || null;
  const newestAny = [...deduplicated].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))[0]?.occurredAt || null;
  const newestObservationAgeDays = newestAny
    ? Math.max(0, Math.floor((asOf.getTime() - new Date(newestAny).getTime()) / 86_400_000))
    : null;
  // A fresh empty-shelf report is useful contradictory evidence, but it must
  // never make an old positive restock pattern look current.
  const newestPositiveAgeDays = lastConfirmedRestock
    ? Math.max(0, Math.floor((asOf.getTime() - new Date(lastConfirmedRestock).getTime()) / 86_400_000))
    : null;
  const stale = newestPositiveAgeDays === null || newestPositiveAgeDays > (input.staleAfterDays ?? 60);
  const weekdays = positives.map((observation) => new Date(observation.occurredAt).getUTCDay());
  const timeBands = positives.map((observation) => timeBand(new Date(observation.occurredAt)));
  const weekdayPattern = dominantValue(weekdays);
  const timePattern = dominantValue(timeBands);
  const recurring = positives.length >= 4 && weekdayPattern.ratio >= 0.6 && timePattern.ratio >= 0.6;
  const conflictRatio = deduplicated.length ? contradictory.length / deduplicated.length : 0;

  let likelihoodBand = RESTOCK_LIKELIHOOD.INSUFFICIENT;
  if (positives.length) likelihoodBand = RESTOCK_LIKELIHOOD.LOW;
  if (positives.length >= 3 && !stale && conflictRatio < 0.5) likelihoodBand = RESTOCK_LIKELIHOOD.MEDIUM;
  if (recurring && !stale && conflictRatio <= 0.25) likelihoodBand = RESTOCK_LIKELIHOOD.HIGH;
  if (stale || conflictRatio >= 0.5) likelihoodBand = positives.length ? RESTOCK_LIKELIHOOD.LOW : RESTOCK_LIKELIHOOD.INSUFFICIENT;

  const confidenceEvaluation = evaluateConfidence({
    sources: positives.map((observation) => ({
      sourceId: observation.sourceId,
      underlyingSourceId: observation.underlyingSourceId,
      quality: observation.confidence,
    })),
    sampleSize: positives.length,
    freshness: newestPositiveAgeDays === null ? 0 : newestPositiveAgeDays <= 14 ? 1 : newestPositiveAgeDays <= 45 ? 0.7 : 0.25,
    identityConfidence: input.identityConfidence || INTELLIGENCE_CONFIDENCE.MEDIUM,
    conditionConfidence: INTELLIGENCE_CONFIDENCE.MEDIUM,
    completeness: recurring ? 0.9 : positives.length >= 2 ? 0.55 : positives.length ? 0.35 : 0,
    contradictions: contradictory.length,
  });
  let confidence = confidenceEvaluation.band;
  if (!positives.length) confidence = INTELLIGENCE_CONFIDENCE.INSUFFICIENT;
  if (stale && confidence === INTELLIGENCE_CONFIDENCE.HIGH) confidence = INTELLIGENCE_CONFIDENCE.LOW;

  const supportingObservations = positives.filter((observation) => {
    const date = new Date(observation.occurredAt);
    return !recurring || (date.getUTCDay() === weekdayPattern.value && timeBand(date) === timePattern.value);
  });
  const contradictoryEvidence = [...contradictory];
  const warnings = [];
  if (!deduplicated.length) warnings.push("No real restock observations match this store and product.");
  if (positives.length > 0 && positives.length < 3) warnings.push("History is sparse and does not support a recurring pattern.");
  if (stale && deduplicated.length) warnings.push("The available restock history is stale.");
  if (contradictory.length) warnings.push("Empty-shelf or unsuccessful-visit observations contradict the positive history.");
  if (recurring) warnings.push("The expected weekday and time band use UTC because no store time zone is configured in this analysis.");
  const expectedWindow = recurring
    ? Object.freeze({ weekdayUtc: weekdayPattern.value, timeBand: timePattern.value, timeBasis: "UTC", precision: "COARSE_PATTERN_ONLY" })
    : null;
  let recommendation = "Collect more confirmed observations before planning a trip.";
  if (likelihoodBand === RESTOCK_LIKELIHOOD.HIGH) recommendation = `A recurring ${timePattern.value.toLowerCase()} UTC window is supported, but confirm current conditions before traveling.`;
  if (likelihoodBand === RESTOCK_LIKELIHOOD.MEDIUM) recommendation = "The history suggests a possible window; verify freshness and contradictory reports before traveling.";
  if (likelihoodBand === RESTOCK_LIKELIHOOD.LOW && positives.length) recommendation = "Treat this as weak historical context, not a restock prediction.";

  return Object.freeze({
    methodologyVersion: ANALYSIS_METHODOLOGY.RESTOCK,
    storeId: input.storeId ? String(input.storeId) : null,
    productId: input.productId ? String(input.productId) : null,
    likelihoodBand,
    confidence,
    confidenceDetails: confidenceEvaluation,
    expectedWindow,
    supportingObservations: Object.freeze(supportingObservations),
    contradictoryEvidence: Object.freeze(contradictoryEvidence),
    lastConfirmedRestock,
    dataFreshness: Object.freeze({
      asOf: asOf.toISOString(),
      newestObservationAt: newestAny,
      newestObservationAgeDays,
      newestPositiveObservationAt: lastConfirmedRestock,
      newestPositiveAgeDays,
      // Retained as an explicit compatibility alias for the freshness basis.
      newestAgeDays: newestPositiveAgeDays,
      stale,
    }),
    sampleSize: positives.length,
    totalObservationCount: deduplicated.length,
    sourceIndependenceCount: new Set(positives.map((observation) => observation.underlyingSourceId)).size,
    warnings: Object.freeze(warnings),
    recommendation,
    probability: null,
    precisionPolicy: "COARSE_BANDS_ONLY",
  });
}
