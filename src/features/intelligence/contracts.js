import {
  ALL_CARD_CONDITIONS,
  ALL_DEFECT_TYPES,
  ALL_EVIDENCE_PROVENANCE,
  CARD_FORMAT,
  DEFECT_SEVERITY,
  DEFECT_TYPE,
  EVIDENCE_PROVENANCE,
  IMAGE_SIDE,
  INTELLIGENCE_CONFIDENCE,
} from "./constants.js";

const MAX_TEXT_LENGTH = 2_000;
const PROHIBITED_AUTHORITY_KEYS = new Set([
  "accesscredential",
  "accesscredentials",
  "accesstoken",
  "auth",
  "authenticated",
  "authentication",
  "authorization",
  "authorizationheader",
  "bearer",
  "bearertoken",
  "clientsecret",
  "cookie",
  "credentials",
  "developerauth",
  "impersonation",
  "isauthorized",
  "ownerauthorized",
  "ownerid",
  "owneridentifier",
  "owneridentity",
  "owner",
  "ownerallowlist",
  "ownersubject",
  "permission",
  "permissions",
  "refreshtoken",
  "role",
  "roles",
  "secret",
  "security",
  "securitycontext",
  "session",
  "sessionid",
  "sessionstate",
  "supabasesession",
  "testauth",
  "token",
  "userid",
]);
const PROHIBITED_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export class IntelligenceContractError extends Error {
  constructor(code, message, field) {
    super(message);
    this.name = "IntelligenceContractError";
    this.code = code;
    this.field = field;
  }
}

function plainObject(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new IntelligenceContractError("OBJECT_REQUIRED", `${field} must be an object.`, field);
  }
  return value;
}

function normalizedKey(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function cloneAndFreezePlainValue(value) {
  if (value === undefined) return null;
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) return value;
  if (Array.isArray(value)) return Object.freeze(value.map(cloneAndFreezePlainValue));
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneAndFreezePlainValue(entry)])));
}

export function assertIntelligenceInputHasNoAuthorityFields(value, path = "$") {
  const stack = [{ value, path }];
  const ancestors = new Set();
  while (stack.length) {
    const current = stack.pop();
    if (current.exit) {
      ancestors.delete(current.value);
      continue;
    }
    if (current.value === null || ["string", "number", "boolean", "undefined"].includes(typeof current.value)) continue;
    if (typeof current.value !== "object") {
      throw new IntelligenceContractError("UNSUPPORTED_INPUT_VALUE", `Unsupported intelligence value at ${current.path}.`, current.path);
    }
    if (ancestors.has(current.value)) {
      throw new IntelligenceContractError("CYCLIC_ANALYSIS_INPUT", `Cyclic intelligence input at ${current.path}.`, current.path);
    }
    ancestors.add(current.value);
    stack.push({ value: current.value, path: current.path, exit: true });
    if (!Array.isArray(current.value)) {
      const prototype = Object.getPrototypeOf(current.value);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new IntelligenceContractError("UNSAFE_ANALYSIS_OBJECT", `Intelligence input at ${current.path} must be a plain object.`, current.path);
      }
    }
    for (const key of Object.keys(current.value)) {
      const nextPath = Array.isArray(current.value) ? `${current.path}[${key}]` : `${current.path}.${key}`;
      if (PROHIBITED_OBJECT_KEYS.has(key)) {
        throw new IntelligenceContractError("PROHIBITED_ANALYSIS_FIELD", `Prohibited intelligence field at ${nextPath}.`, nextPath);
      }
      if (!Array.isArray(current.value) && PROHIBITED_AUTHORITY_KEYS.has(normalizedKey(key))) {
        throw new IntelligenceContractError(
          "AUTHORITATIVE_OWNER_SCOPE_PROHIBITED",
          "Authentication, owner, role, session, token, and security authority cannot be supplied through intelligence input.",
          nextPath,
        );
      }
      stack.push({ value: current.value[key], path: nextPath });
    }
  }
  return value;
}

function boundedString(value, field, options = {}) {
  if (value === null || value === undefined || value === "") {
    if (options.required) throw new IntelligenceContractError("FIELD_REQUIRED", `${field} is required.`, field);
    return "";
  }
  const text = String(value).trim();
  if (text.length > (options.maxLength || MAX_TEXT_LENGTH)) {
    throw new IntelligenceContractError("TEXT_TOO_LONG", `${field} exceeds its length limit.`, field);
  }
  return text;
}

function enumValue(value, allowed, fallback, field) {
  const normalized = String(value || fallback).trim().toUpperCase();
  if (!allowed.includes(normalized)) {
    throw new IntelligenceContractError("INVALID_ENUM", `${field} contains an unsupported value.`, field);
  }
  return normalized;
}

function boundedInteger(value, field, fallback = 1, maximum = 100) {
  const number = value === null || value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(number) || number < 0 || number > maximum) {
    throw new IntelligenceContractError("INVALID_INTEGER", `${field} must be an integer from 0 to ${maximum}.`, field);
  }
  return number;
}

function normalizeIsoTimestamp(value, field) {
  if (value === null || value === undefined || value === "") return null;
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    throw new IntelligenceContractError("INVALID_TIMESTAMP", `${field} must be a valid timestamp.`, field);
  }
  return timestamp.toISOString();
}

export function normalizeEvidenceProvenance(value, field = "provenance") {
  return enumValue(value, ALL_EVIDENCE_PROVENANCE, EVIDENCE_PROVENANCE.OWNER_ENTERED, field);
}

export function normalizeCardIdentity(value = {}) {
  const input = plainObject(value, "identity");
  const format = enumValue(input.format, Object.values(CARD_FORMAT), CARD_FORMAT.UNKNOWN, "identity.format");
  return Object.freeze({
    productName: boundedString(input.productName || input.cardName || input.title, "identity.productName"),
    set: boundedString(input.set, "identity.set", { maxLength: 300 }),
    cardNumber: boundedString(input.cardNumber, "identity.cardNumber", { maxLength: 100 }),
    language: boundedString(input.language, "identity.language", { maxLength: 100 }),
    variant: boundedString(input.variant, "identity.variant", { maxLength: 300 }),
    printingOrEdition: boundedString(input.printingOrEdition || input.printing || input.edition, "identity.printingOrEdition", { maxLength: 300 }),
    format,
    gradingCompany: format === CARD_FORMAT.SLABBED
      ? boundedString(input.gradingCompany, "identity.gradingCompany", { maxLength: 100 })
      : "",
    grade: format === CARD_FORMAT.SLABBED
      ? boundedString(input.grade, "identity.grade", { maxLength: 100 })
      : "",
    certificationNumber: format === CARD_FORMAT.SLABBED
      ? boundedString(input.certificationNumber, "identity.certificationNumber", { maxLength: 150 })
      : "",
    source: normalizeEvidenceProvenance(input.source || input.provenance, "identity.source"),
    confidence: enumValue(
      input.confidence,
      Object.values(INTELLIGENCE_CONFIDENCE),
      INTELLIGENCE_CONFIDENCE.INSUFFICIENT,
      "identity.confidence",
    ),
  });
}

export function normalizeImageReference(value, index = 0) {
  const input = plainObject(value, `images[${index}]`);
  const effects = plainObject(input.effects || {}, `images[${index}].effects`);
  return Object.freeze({
    imageId: boundedString(input.imageId || input.id || `image-${index + 1}`, `images[${index}].imageId`, { required: true, maxLength: 200 }),
    reference: boundedString(input.reference || input.url || input.path, `images[${index}].reference`, { maxLength: 4_000 }),
    side: enumValue(input.side, Object.values(IMAGE_SIDE), IMAGE_SIDE.UNKNOWN, `images[${index}].side`),
    quality: enumValue(
      input.quality,
      Object.values(INTELLIGENCE_CONFIDENCE),
      INTELLIGENCE_CONFIDENCE.INSUFFICIENT,
      `images[${index}].quality`,
    ),
    provenance: normalizeEvidenceProvenance(input.provenance, `images[${index}].provenance`),
    capturedAt: normalizeIsoTimestamp(input.capturedAt, `images[${index}].capturedAt`),
    effects: Object.freeze({
      glare: Boolean(effects.glare),
      sleeve: Boolean(effects.sleeve),
      toploader: Boolean(effects.toploader),
      blur: Boolean(effects.blur),
      lowResolution: Boolean(effects.lowResolution),
      cropped: Boolean(effects.cropped),
    }),
  });
}

export function normalizeDefectObservation(value, index = 0) {
  const input = plainObject(value, `observations[${index}]`);
  const rawType = String(input.defectType || input.type || DEFECT_TYPE.UNKNOWN_OR_UNVERIFIABLE).trim().toUpperCase();
  const defectType = ALL_DEFECT_TYPES.includes(rawType) ? rawType : DEFECT_TYPE.UNKNOWN_OR_UNVERIFIABLE;
  const locations = Array.isArray(input.locations)
    ? input.locations.map((location, locationIndex) => boundedString(location, `observations[${index}].locations[${locationIndex}]`, { maxLength: 100 })).filter(Boolean)
    : [boundedString(input.location, `observations[${index}].location`, { maxLength: 100 })].filter(Boolean);
  return Object.freeze({
    observationId: boundedString(input.observationId || input.id || `observation-${index + 1}`, `observations[${index}].observationId`, { required: true, maxLength: 200 }),
    defectType,
    severity: enumValue(input.severity, Object.values(DEFECT_SEVERITY), DEFECT_SEVERITY.UNKNOWN, `observations[${index}].severity`),
    quantity: Math.max(1, boundedInteger(input.quantity, `observations[${index}].quantity`, 1, 100)),
    side: enumValue(input.side, Object.values(IMAGE_SIDE), IMAGE_SIDE.UNKNOWN, `observations[${index}].side`),
    locations: Object.freeze(locations),
    observed: input.observed !== false,
    structuralDamage: Boolean(input.structuralDamage),
    confidence: enumValue(
      input.confidence,
      Object.values(INTELLIGENCE_CONFIDENCE),
      INTELLIGENCE_CONFIDENCE.LOW,
      `observations[${index}].confidence`,
    ),
    provenance: normalizeEvidenceProvenance(input.provenance, `observations[${index}].provenance`),
    sourceId: boundedString(input.sourceId, `observations[${index}].sourceId`, { maxLength: 300 }),
    underlyingSourceId: boundedString(input.underlyingSourceId, `observations[${index}].underlyingSourceId`, { maxLength: 300 }),
    note: boundedString(input.note, `observations[${index}].note`),
  });
}

function normalizeOwnerCorrections(value = {}) {
  const input = plainObject(value || {}, "ownerCorrections");
  const condition = input.confirmedCondition
    ? enumValue(input.confirmedCondition, ALL_CARD_CONDITIONS, null, "ownerCorrections.confirmedCondition")
    : null;
  return Object.freeze({
    confirmedCondition: condition,
    identity: input.identity ? normalizeCardIdentity({ ...input.identity, source: EVIDENCE_PROVENANCE.OWNER_ENTERED }) : null,
    manualValue: input.manualValue ? cloneAndFreezePlainValue(input.manualValue) : null,
    note: boundedString(input.note, "ownerCorrections.note"),
    correctedAt: normalizeIsoTimestamp(input.correctedAt, "ownerCorrections.correctedAt"),
    provenance: condition || input.identity || input.manualValue
      ? EVIDENCE_PROVENANCE.OWNER_ENTERED
      : null,
  });
}

function normalizeSourceObservation(value, sourceIndex, observationIndex) {
  const field = `sourceEvidence[${sourceIndex}].observations[${observationIndex}]`;
  const input = plainObject(value, field);
  const provenance = plainObject(input.provenance || {}, `${field}.provenance`);
  let observationValue = input.value;
  if (typeof observationValue === "string") observationValue = boundedString(observationValue, `${field}.value`, { maxLength: 4_000 });
  else if (typeof observationValue === "number" && !Number.isFinite(observationValue)) {
    throw new IntelligenceContractError("INVALID_NUMBER", `${field}.value must be finite.`, `${field}.value`);
  } else if (!["number", "boolean"].includes(typeof observationValue)) {
    throw new IntelligenceContractError("INVALID_OBSERVATION_VALUE", `${field}.value must be text, a number, or a boolean.`, `${field}.value`);
  }
  return Object.freeze({
    observationType: boundedString(input.observationType || input.type, `${field}.observationType`, { required: true, maxLength: 150 }),
    value: observationValue,
    provenance: Object.freeze({
      kind: normalizeEvidenceProvenance(provenance.kind, `${field}.provenance.kind`),
      providerId: boundedString(provenance.providerId, `${field}.provenance.providerId`, { maxLength: 150 }),
      sourceId: boundedString(provenance.sourceId, `${field}.provenance.sourceId`, { maxLength: 300 }),
      independenceKey: boundedString(provenance.independenceKey, `${field}.provenance.independenceKey`, { maxLength: 300 }),
    }),
    confidence: enumValue(
      input.confidence,
      Object.values(INTELLIGENCE_CONFIDENCE),
      INTELLIGENCE_CONFIDENCE.LOW,
      `${field}.confidence`,
    ),
  });
}

function normalizeSourceEvidence(value, index) {
  const field = `sourceEvidence[${index}]`;
  const input = plainObject(value, field);
  const externalIdentity = plainObject(input.externalIdentity || {}, `${field}.externalIdentity`);
  const observations = Array.isArray(input.observations) ? input.observations : [];
  if (observations.length > 100) {
    throw new IntelligenceContractError("TOO_MANY_OBSERVATIONS", `${field}.observations exceeds its record limit.`, `${field}.observations`);
  }
  const warningEntries = Array.isArray(input.warnings) ? input.warnings : [];
  const limitationEntries = Array.isArray(input.limitations) ? input.limitations : [];
  if (warningEntries.length > 100 || limitationEntries.length > 100) {
    throw new IntelligenceContractError("TOO_MANY_SOURCE_MESSAGES", `${field} exceeds its warning or limitation limit.`, field);
  }
  return Object.freeze({
    adapterVersion: boundedString(input.adapterVersion, `${field}.adapterVersion`, { required: true, maxLength: 200 }),
    providerId: boundedString(input.providerId, `${field}.providerId`, { required: true, maxLength: 150 }),
    sourceId: boundedString(input.sourceId, `${field}.sourceId`, { required: true, maxLength: 300 }),
    sourceKind: boundedString(input.sourceKind, `${field}.sourceKind`, { required: true, maxLength: 150 }),
    listingState: boundedString(input.listingState, `${field}.listingState`, { maxLength: 100 }),
    observedAt: normalizeIsoTimestamp(input.observedAt, `${field}.observedAt`),
    provenance: normalizeEvidenceProvenance(input.provenance || EVIDENCE_PROVENANCE.PROVIDER_SUPPLIED, `${field}.provenance`),
    externalIdentity: Object.freeze({
      externalListingId: boundedString(externalIdentity.externalListingId, `${field}.externalIdentity.externalListingId`, { maxLength: 200 }),
      listingUrl: boundedString(externalIdentity.listingUrl, `${field}.externalIdentity.listingUrl`, { maxLength: 4_000 }),
      marketplace: boundedString(externalIdentity.marketplace, `${field}.externalIdentity.marketplace`, { maxLength: 150 }),
    }),
    observations: Object.freeze(observations.map((entry, observationIndex) => normalizeSourceObservation(entry, index, observationIndex))),
    warnings: Object.freeze(warningEntries.map((entry, warningIndex) => {
      const warning = plainObject(entry, `${field}.warnings[${warningIndex}]`);
      return Object.freeze({
        code: boundedString(warning.code, `${field}.warnings[${warningIndex}].code`, { required: true, maxLength: 150 }),
        message: boundedString(warning.message, `${field}.warnings[${warningIndex}].message`, { required: true }),
      });
    })),
    limitations: Object.freeze(limitationEntries.map((entry, limitationIndex) => (
      boundedString(entry, `${field}.limitations[${limitationIndex}]`)
    )).filter(Boolean)),
  });
}

export function normalizeCardAnalysisInput(value = {}) {
  const input = plainObject(value, "analysisInput");
  assertIntelligenceInputHasNoAuthorityFields(input);
  const images = (Array.isArray(input.images) ? input.images : []).map(normalizeImageReference);
  const observations = (Array.isArray(input.observations) ? input.observations : []).map(normalizeDefectObservation);
  const sourceEvidence = (Array.isArray(input.sourceEvidence) ? input.sourceEvidence : []);
  if (sourceEvidence.length > 25) {
    throw new IntelligenceContractError("TOO_MANY_SOURCE_RECORDS", "sourceEvidence exceeds its record limit.", "sourceEvidence");
  }
  const ownerCorrections = normalizeOwnerCorrections(input.ownerCorrections || {});
  return Object.freeze({
    analysisType: "CARD",
    identity: ownerCorrections.identity || normalizeCardIdentity(input.identity || {}),
    images: Object.freeze(images),
    observations: Object.freeze(observations),
    sourceEvidence: Object.freeze(sourceEvidence.map(normalizeSourceEvidence)),
    inspectionComplete: Boolean(input.inspectionComplete),
    ownerCorrections,
    valuationEvidence: cloneAndFreezePlainValue(Array.isArray(input.valuationEvidence) ? input.valuationEvidence : []),
    dealAssumptions: input.dealAssumptions && typeof input.dealAssumptions === "object"
      ? cloneAndFreezePlainValue(input.dealAssumptions)
      : null,
    sourceReference: boundedString(input.sourceReference, "analysisInput.sourceReference", { maxLength: 4_000 }),
    requestedAt: normalizeIsoTimestamp(input.requestedAt, "analysisInput.requestedAt"),
    warnings: Object.freeze((Array.isArray(input.warnings) ? input.warnings : []).map((warning, index) => boundedString(warning, `warnings[${index}]`)).filter(Boolean)),
  });
}
