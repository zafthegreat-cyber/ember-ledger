import { hashCanonicalJson } from "../backup/canonicalJson.js";
import { ANALYSIS_METHODOLOGY, EVIDENCE_PROVENANCE, INTELLIGENCE_CONFIDENCE } from "./constants.js";
import {
  assertIntelligenceInputHasNoAuthorityFields,
  normalizeCardAnalysisInput,
  normalizeCardIdentity,
  normalizeDefectObservation,
  normalizeImageReference,
} from "./contracts.js";
import { assessCardCondition } from "./conditionAssessment.js";
import { buildConditionAwareValuation } from "./valuation.js";
import { analyzeDealIntelligence } from "./dealIntelligence.js";

function summarizeProvenance(images, observations, identity, sourceEvidence) {
  const counts = Object.fromEntries(Object.values(EVIDENCE_PROVENANCE).map((value) => [value, 0]));
  for (const entry of [...images, ...observations, identity, ...sourceEvidence]) {
    if (entry?.provenance && Object.hasOwn(counts, entry.provenance)) counts[entry.provenance] += 1;
    if (entry?.source && Object.hasOwn(counts, entry.source)) counts[entry.source] += 1;
  }
  return Object.freeze(counts);
}

function defaultClock() {
  return new Date();
}

export function createCardAnalysisPipeline(options = {}) {
  const clock = options.clock || defaultClock;
  const identityResolver = options.identityResolver || (async ({ identity }) => identity);
  const evidenceExtractor = options.evidenceExtractor || (async ({ images, observations }) => ({ images, observations }));
  const valuationResolver = options.valuationResolver || (async (valuationInput) => buildConditionAwareValuation(valuationInput));
  const persistAnalysis = options.persistAnalysis || null;

  return Object.freeze({
    async analyze(rawInput, analyzeOptions = {}) {
      const normalizedRequestInput = normalizeCardAnalysisInput(rawInput);
      const requestInputHash = await hashCanonicalJson(normalizedRequestInput, options.hashImplementation);
      const resolvedIdentity = normalizeCardIdentity(await identityResolver(normalizedRequestInput, analyzeOptions));
      const extracted = await evidenceExtractor({
        ...normalizedRequestInput,
        identity: resolvedIdentity,
      }, analyzeOptions);
      assertIntelligenceInputHasNoAuthorityFields(extracted || {});
      const images = (Array.isArray(extracted?.images) ? extracted.images : normalizedRequestInput.images).map(normalizeImageReference);
      const observations = (Array.isArray(extracted?.observations) ? extracted.observations : normalizedRequestInput.observations).map(normalizeDefectObservation);
      const normalizedInput = Object.freeze({
        ...normalizedRequestInput,
        identity: resolvedIdentity,
        images: Object.freeze(images),
        observations: Object.freeze(observations),
      });
      const inputHash = await hashCanonicalJson(normalizedInput, options.hashImplementation);
      const condition = assessCardCondition({
        images,
        observations,
        inspectionComplete: normalizedInput.inspectionComplete,
        ownerConfirmedCondition: normalizedInput.ownerCorrections.confirmedCondition,
      });
      const analyzedAt = new Date(clock()).toISOString();
      const valuation = await valuationResolver({
        evidence: normalizedInput.valuationEvidence,
        condition: condition.resolvedCondition,
        identityConfidence: resolvedIdentity.confidence,
        conditionConfidence: condition.confidence,
        contradictions: condition.contradictions.length,
        asOf: analyzedAt,
        currency: analyzeOptions.currency || "USD",
      }, analyzeOptions);
      const expectedResaleValue = normalizedInput.ownerCorrections.manualValue
        || normalizedInput.dealAssumptions?.expectedResaleValue
        || valuation.conditionAdjustedValue;
      const ownerResaleAssumption = normalizedInput.ownerCorrections.manualValue
        || normalizedInput.dealAssumptions?.expectedResaleValue;
      // An owner-entered resale value is one assumption, not independent market
      // confirmation. It must not borrow HIGH/MEDIUM confidence from a separate
      // completed-sale estimate that the recommendation is not using.
      const dealConfidence = ownerResaleAssumption
        ? INTELLIGENCE_CONFIDENCE.LOW
        : valuation.confidence.band;
      const dealIntelligence = normalizedInput.dealAssumptions?.askingPrice
        ? analyzeDealIntelligence({
          ...normalizedInput.dealAssumptions,
          expectedResaleValue,
          confidence: dealConfidence,
          completedSaleSampleSize: valuation.completedSales.count,
          valueSource: normalizedInput.ownerCorrections.manualValue
            ? "OWNER_CORRECTION"
            : normalizedInput.dealAssumptions?.expectedResaleValue
              ? "OWNER_ASSUMPTION"
            : valuation.conditionAdjustedValue ? "VERIFIED_COMPLETED_SALES" : "UNAVAILABLE",
        })
        : null;
      const warnings = [
        ...normalizedInput.warnings,
        ...condition.uncertainty,
        ...valuation.warnings,
        ...(dealIntelligence?.warnings || []),
      ];
      const result = Object.freeze({
        analysisType: "CARD",
        analysisVersion: 1,
        methodologyVersion: ANALYSIS_METHODOLOGY.CARD,
        analyzedAt,
        inputHash,
        requestInputHash,
        normalizedInput,
        identity: resolvedIdentity,
        evidence: Object.freeze({
          images: Object.freeze([...images]),
          observations: Object.freeze([...observations]),
          sourceEvidence: normalizedInput.sourceEvidence,
          provenanceSummary: summarizeProvenance(images, observations, resolvedIdentity, normalizedInput.sourceEvidence),
          extractionAdapterUsed: Boolean(options.evidenceExtractor),
        }),
        condition,
        valuation,
        dealIntelligence,
        ownerCorrections: normalizedInput.ownerCorrections,
        warnings: Object.freeze([...new Set(warnings)]),
      });
      if (analyzeOptions.persist === true) {
        if (typeof persistAnalysis !== "function") throw new Error("No persistence adapter is configured for this analysis pipeline.");
        const persisted = await persistAnalysis(result, analyzeOptions);
        return Object.freeze({ ...result, persistence: Object.freeze({ requested: true, persisted: true, record: persisted }) });
      }
      return Object.freeze({ ...result, persistence: Object.freeze({ requested: false, persisted: false }) });
    },
  });
}

export async function runCardAnalysis(input, options = {}) {
  return createCardAnalysisPipeline(options).analyze(input, options.analyzeOptions || {});
}
