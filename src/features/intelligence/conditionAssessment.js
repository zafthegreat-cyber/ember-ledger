import {
  ANALYSIS_METHODOLOGY,
  CARD_CONDITION,
  DEFECT_SEVERITY,
  DEFECT_TYPE,
  IMAGE_SIDE,
  INTELLIGENCE_CONFIDENCE,
} from "./constants.js";
import { confidenceBand, confidenceScore } from "./confidence.js";
import { normalizeDefectObservation, normalizeImageReference } from "./contracts.js";

const SEVERITY_WEIGHT = Object.freeze({
  [DEFECT_SEVERITY.UNKNOWN]: 0,
  [DEFECT_SEVERITY.MINOR]: 1,
  [DEFECT_SEVERITY.MODERATE]: 3,
  [DEFECT_SEVERITY.SEVERE]: 6,
  [DEFECT_SEVERITY.CRITICAL]: 10,
});

const STRUCTURAL_DEFECTS = new Set([
  DEFECT_TYPE.CREASES,
  DEFECT_TYPE.FOLDS,
  DEFECT_TYPE.TEARS,
  DEFECT_TYPE.CUTS,
  DEFECT_TYPE.PEELING,
  DEFECT_TYPE.WATER_OR_LIQUID_DAMAGE,
  DEFECT_TYPE.MISSING_MATERIAL,
]);

const FORCE_DAMAGED_AT_MODERATE = new Set([
  DEFECT_TYPE.FOLDS,
  DEFECT_TYPE.TEARS,
  DEFECT_TYPE.CUTS,
  DEFECT_TYPE.MISSING_MATERIAL,
]);

const DEFECT_LABELS = Object.freeze({
  [DEFECT_TYPE.WHITENING]: "whitening",
  [DEFECT_TYPE.EDGE_WEAR]: "edge wear",
  [DEFECT_TYPE.CORNER_WEAR]: "corner wear",
  [DEFECT_TYPE.SURFACE_SCRATCHES]: "surface scratches",
  [DEFECT_TYPE.DENTS]: "dents",
  [DEFECT_TYPE.CREASES]: "creases",
  [DEFECT_TYPE.FOLDS]: "folds",
  [DEFECT_TYPE.TEARS]: "tears",
  [DEFECT_TYPE.CUTS]: "cuts",
  [DEFECT_TYPE.PEELING]: "peeling",
  [DEFECT_TYPE.STAINING]: "staining",
  [DEFECT_TYPE.INK_OR_WRITING]: "ink or writing",
  [DEFECT_TYPE.WATER_OR_LIQUID_DAMAGE]: "water or liquid damage",
  [DEFECT_TYPE.WARPING]: "warping",
  [DEFECT_TYPE.PRINT_DEFECTS]: "print defects",
  [DEFECT_TYPE.BINDER_DENTS]: "binder dents",
  [DEFECT_TYPE.PRESSURE_MARKS]: "pressure marks",
  [DEFECT_TYPE.HOLO_SCRATCHING]: "holo scratching",
  [DEFECT_TYPE.CENTERING_OBSERVATION]: "centering observations",
  [DEFECT_TYPE.MISSING_MATERIAL]: "missing material",
  [DEFECT_TYPE.UNKNOWN_OR_UNVERIFIABLE]: "an unknown or unverifiable defect",
});

function imageQualityScore(image) {
  const base = confidenceScore(image.quality, 0.15);
  const effects = Object.values(image.effects).filter(Boolean).length;
  return Math.max(0.1, base - Math.min(0.5, effects * 0.1));
}

function observationKey(observation) {
  return `${observation.defectType}|${observation.side}|${observation.locations.join(",")}`;
}

function findContradictions(observations) {
  const byKey = new Map();
  for (const observation of observations) {
    if (observation.defectType === DEFECT_TYPE.CENTERING_OBSERVATION) continue;
    const key = observationKey(observation);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(observation);
  }
  const contradictions = [];
  for (const [key, entries] of byKey) {
    const positive = entries.filter((entry) => entry.observed);
    const negative = entries.filter((entry) => !entry.observed);
    const severities = new Set(positive.map((entry) => entry.severity));
    if ((positive.length && negative.length) || severities.size > 2) contradictions.push(key);
  }
  return contradictions;
}

function quantityMultiplier(quantity) {
  if (quantity <= 1) return 1;
  if (quantity === 2) return 1.35;
  if (quantity <= 4) return 1.7;
  return 2.2;
}

function proposesDamage(observation) {
  if (!observation.observed) return false;
  const severity = observation.severity;
  if (observation.structuralDamage && [DEFECT_SEVERITY.SEVERE, DEFECT_SEVERITY.CRITICAL].includes(severity)) return true;
  if (FORCE_DAMAGED_AT_MODERATE.has(observation.defectType)) {
    return [DEFECT_SEVERITY.MODERATE, DEFECT_SEVERITY.SEVERE, DEFECT_SEVERITY.CRITICAL].includes(severity);
  }
  if (!STRUCTURAL_DEFECTS.has(observation.defectType)) return false;
  return [DEFECT_SEVERITY.SEVERE, DEFECT_SEVERITY.CRITICAL].includes(severity);
}

function conditionFromScore(score, observedDefects, forcedDamaged) {
  if (forcedDamaged) return CARD_CONDITION.DMG;
  if (!observedDefects.length) return CARD_CONDITION.NM;
  if (score <= 2.5) return CARD_CONDITION.LP;
  if (score <= 7) return CARD_CONDITION.MP;
  return CARD_CONDITION.HP;
}

function severityText(severity) {
  return String(severity || "").toLowerCase();
}

function buildExplanation(condition, observedDefects, forcedDamaged) {
  if (!condition) return "Condition could not be proposed because the available evidence is insufficient.";
  if (!observedDefects.length) {
    return "NM proposed because a usable front-and-back inspection reported no visible wear; unseen defects may still exist.";
  }
  const noteworthy = [...observedDefects]
    .sort((left, right) => SEVERITY_WEIGHT[right.severity] - SEVERITY_WEIGHT[left.severity])
    .slice(0, 3)
    .map((observation) => `${severityText(observation.severity)} ${DEFECT_LABELS[observation.defectType]}`);
  const structuralText = forcedDamaged
    ? " Structural damage is severe enough to control the proposal."
    : " No structural damage was identified from the available evidence.";
  return `${condition} proposed because ${noteworthy.join(", ")} ${noteworthy.length === 1 ? "was" : "were"} observed.${structuralText}`;
}

export function assessCardCondition(input = {}) {
  const images = (Array.isArray(input.images) ? input.images : []).map(normalizeImageReference);
  const observations = (Array.isArray(input.observations) ? input.observations : []).map(normalizeDefectObservation);
  const observedDefects = observations.filter((observation) => (
    observation.observed
    && observation.defectType !== DEFECT_TYPE.CENTERING_OBSERVATION
    && observation.defectType !== DEFECT_TYPE.UNKNOWN_OR_UNVERIFIABLE
  ));
  const centeringObservations = observations.filter((observation) => observation.observed && observation.defectType === DEFECT_TYPE.CENTERING_OBSERVATION);
  const unverifiableObservations = observations.filter((observation) => observation.defectType === DEFECT_TYPE.UNKNOWN_OR_UNVERIFIABLE);
  const contradictions = findContradictions(observations);
  const frontImages = images.filter((image) => image.side === IMAGE_SIDE.FRONT);
  const backImages = images.filter((image) => image.side === IMAGE_SIDE.BACK);
  const imageScores = images.map(imageQualityScore);
  const averageImageQuality = imageScores.length ? imageScores.reduce((sum, value) => sum + value, 0) / imageScores.length : 0;
  const effects = images.flatMap((image) => Object.entries(image.effects).filter(([, active]) => active).map(([effect]) => effect));
  const inspectionComplete = Boolean(input.inspectionComplete);
  const usableFrontAndBack = frontImages.some((image) => imageQualityScore(image) >= 0.5)
    && backImages.some((image) => imageQualityScore(image) >= 0.5);
  const hasPositiveEvidence = observedDefects.length > 0;
  const forcedDamaged = observedDefects.some(proposesDamage);

  const score = observedDefects.reduce((total, observation) => {
    const base = SEVERITY_WEIGHT[observation.severity] || 0;
    const confidence = confidenceScore(observation.confidence, 0.42);
    const sideMultiplier = observation.side === IMAGE_SIDE.UNKNOWN ? 0.9 : 1;
    return total + (base * quantityMultiplier(observation.quantity) * confidence * sideMultiplier);
  }, 0);
  const insufficientForCleanProposal = !hasPositiveEvidence && (!inspectionComplete || !usableFrontAndBack || averageImageQuality < 0.55);
  const proposedCondition = insufficientForCleanProposal
    ? null
    : conditionFromScore(score, observedDefects, forcedDamaged);

  const observationConfidence = observations.length
    ? observations.reduce((sum, observation) => sum + confidenceScore(observation.confidence, 0.3), 0) / observations.length
    : (inspectionComplete ? 0.6 : 0.15);
  const coverageScore = usableFrontAndBack ? 1 : (frontImages.length || backImages.length ? 0.55 : 0.1);
  const confidenceNumeric = Math.max(0, Math.min(1,
    (averageImageQuality * 0.36)
    + (coverageScore * 0.32)
    + (observationConfidence * 0.32)
    - Math.min(0.45, contradictions.length * 0.16)
    - Math.min(0.3, unverifiableObservations.length * 0.08),
  ));
  const confidence = confidenceBand(confidenceNumeric, { insufficient: !proposedCondition });

  const defectsNotAssessable = [];
  if (!frontImages.length) defectsNotAssessable.push("Front surface, front corners, centering, and holo wear were not assessable.");
  if (!backImages.length) defectsNotAssessable.push("Back surface, back edges, and back corners were not assessable.");
  if (effects.length) defectsNotAssessable.push(`Image limitations (${[...new Set(effects)].join(", ")}) may hide surface or edge defects.`);
  if (averageImageQuality < 0.52) defectsNotAssessable.push("Fine scratches, dents, pressure marks, and subtle surface wear were not reliably assessable.");
  if (unverifiableObservations.length) defectsNotAssessable.push("One or more reported defects could not be verified from the supplied evidence.");

  const uncertainty = [];
  if (!usableFrontAndBack) uncertainty.push("Usable front-and-back coverage is incomplete.");
  if (contradictions.length) uncertainty.push("Evidence conflicts about one or more defects.");
  if (confidence === INTELLIGENCE_CONFIDENCE.LOW) uncertainty.push("Condition confidence is low; owner review is recommended.");
  if (confidence === INTELLIGENCE_CONFIDENCE.INSUFFICIENT) uncertainty.push("No supported condition proposal can be made from the current evidence.");
  if (centeringObservations.length) uncertainty.push("Centering is reported separately and does not determine card condition.");

  const ownerConfirmedCondition = input.ownerConfirmedCondition || null;
  return Object.freeze({
    methodologyVersion: ANALYSIS_METHODOLOGY.CONDITION,
    proposedCondition,
    ownerConfirmedCondition,
    resolvedCondition: ownerConfirmedCondition || proposedCondition,
    confidence,
    confidenceScore: Number(confidenceNumeric.toFixed(4)),
    visibleEvidence: Object.freeze(observedDefects.map((observation) => Object.freeze({
      defectType: observation.defectType,
      severity: observation.severity,
      quantity: observation.quantity,
      side: observation.side,
      locations: observation.locations,
      confidence: observation.confidence,
      provenance: observation.provenance,
    }))),
    defectsObserved: Object.freeze(observedDefects),
    defectsNotAssessable: Object.freeze(defectsNotAssessable),
    centeringObservations: Object.freeze(centeringObservations),
    uncertainty: Object.freeze(uncertainty),
    contradictions: Object.freeze(contradictions),
    imageCoverage: Object.freeze({
      frontAvailable: frontImages.length > 0,
      backAvailable: backImages.length > 0,
      usableFrontAndBack,
      imageCount: images.length,
      averageQualityScore: Number(averageImageQuality.toFixed(4)),
      affectedByGlare: effects.includes("glare"),
      affectedBySleeve: effects.includes("sleeve"),
      affectedByToploader: effects.includes("toploader"),
      affectedByImageQuality: averageImageQuality < 0.7 || effects.length > 0,
    }),
    structuralDamageIdentified: forcedDamaged,
    wearScore: Number(score.toFixed(4)),
    explanation: buildExplanation(proposedCondition, observedDefects, forcedDamaged),
    professionalGradePrediction: null,
  });
}
