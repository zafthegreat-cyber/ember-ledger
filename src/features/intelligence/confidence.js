import { INTELLIGENCE_CONFIDENCE } from "./constants.js";

const CONFIDENCE_SCORE = Object.freeze({
  HIGH: 1,
  MEDIUM: 0.72,
  LOW: 0.42,
  INSUFFICIENT: 0.15,
});

function bounded(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : fallback;
}

export function confidenceScore(value, fallback = 0) {
  if (typeof value === "string" && Object.hasOwn(CONFIDENCE_SCORE, value.toUpperCase())) {
    return CONFIDENCE_SCORE[value.toUpperCase()];
  }
  return bounded(value, fallback);
}

export function confidenceBand(score, options = {}) {
  const numeric = bounded(score, 0);
  if (options.insufficient || numeric < 0.25) return INTELLIGENCE_CONFIDENCE.INSUFFICIENT;
  if (numeric >= 0.8) return INTELLIGENCE_CONFIDENCE.HIGH;
  if (numeric >= 0.52) return INTELLIGENCE_CONFIDENCE.MEDIUM;
  return INTELLIGENCE_CONFIDENCE.LOW;
}

export function evaluateConfidence(input = {}) {
  const sources = Array.isArray(input.sources) ? input.sources : [];
  const independentSources = new Map();
  for (const source of sources) {
    if (!source || source.included === false) continue;
    const independenceKey = String(source.underlyingSourceId || source.sourceId || "unknown");
    const quality = confidenceScore(source.quality ?? source.confidence, 0.35);
    independentSources.set(independenceKey, Math.max(independentSources.get(independenceKey) || 0, quality));
  }

  const qualities = [...independentSources.values()];
  const sourceQuality = qualities.length ? qualities.reduce((sum, value) => sum + value, 0) / qualities.length : 0;
  const sampleSize = Math.max(0, Number.isFinite(Number(input.sampleSize)) ? Number(input.sampleSize) : sources.length);
  const sampleStrength = sampleSize >= 8 ? 1 : sampleSize >= 4 ? 0.78 : sampleSize >= 2 ? 0.52 : sampleSize === 1 ? 0.3 : 0;
  const freshness = bounded(input.freshness, 0.4);
  const identity = confidenceScore(input.identityConfidence, 0.5);
  const condition = confidenceScore(input.conditionConfidence, 0.5);
  const completeness = bounded(input.completeness, 0.5);
  const contradictionCount = Math.max(0, Number(input.contradictions) || 0);
  const contradictionPenalty = Math.min(0.45, contradictionCount * 0.12);
  const independencePenalty = sources.length > independentSources.size
    ? Math.min(0.18, (sources.length - independentSources.size) * 0.04)
    : 0;

  const weighted = (
    sourceQuality * 0.24
    + sampleStrength * 0.18
    + freshness * 0.14
    + identity * 0.16
    + condition * 0.14
    + completeness * 0.14
  );
  const independenceCap = sources.length > 1 && independentSources.size < 2 ? 0.74 : 1;
  const score = Math.max(0, Math.min(independenceCap, weighted - contradictionPenalty - independencePenalty));
  const insufficient = sampleSize === 0 || qualities.length === 0 || completeness < 0.2;
  const band = confidenceBand(score, { insufficient });
  const rationale = [];
  rationale.push(`${independentSources.size} independent source${independentSources.size === 1 ? "" : "s"} represented.`);
  if (sources.length > independentSources.size) rationale.push("Repeated evidence from the same underlying source was not counted as independent confirmation.");
  if (sampleSize < 3) rationale.push("The sample is too small for strong confidence.");
  if (freshness < 0.5) rationale.push("Some evidence is stale or has no reliable observation time.");
  if (contradictionCount) rationale.push(`${contradictionCount} contradiction${contradictionCount === 1 ? "" : "s"} lowered confidence.`);
  if (completeness < 0.6) rationale.push("Important evidence is incomplete.");

  return Object.freeze({
    band,
    score: Number(score.toFixed(4)),
    independentSourceCount: independentSources.size,
    sampleSize,
    factors: Object.freeze({
      sourceQuality: Number(sourceQuality.toFixed(4)),
      sampleStrength,
      freshness,
      identity,
      condition,
      completeness,
      contradictionPenalty,
      independencePenalty,
      independenceCap,
    }),
    rationale: Object.freeze(rationale),
  });
}
