import { hashCanonicalJson } from "../backup/index.js";
import {
  PERSISTENCE_MODES,
  createLocalCollectionDataSource,
  createPersistenceGateway,
} from "../persistence/index.js";
import { assertMoney, formatMoneyForDisplay, minorUnitsToMajorString } from "./money.js";

export const INTELLIGENCE_ANALYSIS_FORMAT = "code3-intelligence-analysis-v1";
export const INTELLIGENCE_ANALYSIS_RECORD_TYPE = "CODE3_INTELLIGENCE_ANALYSIS";

const CONDITION_VALUES = new Set(["NM", "LP", "MP", "HP", "DMG"]);
const AUTHORITY_FIELD_KEYS = new Set([
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

export class AnalysisHistoryError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "AnalysisHistoryError";
    this.code = code;
    this.details = details;
  }
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function normalizedKey(key) {
  return String(key).toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Analysis input is business data, never an authorization channel. Reject
 * authority-bearing fields at any depth before they can reach persistence.
 */
export function assertAnalysisInputHasNoAuthorityFields(value, path = "$") {
  const stack = [{ value, path }];
  const ancestors = new Set();

  while (stack.length) {
    const current = stack.pop();
    if (current.exit === true) {
      ancestors.delete(current.value);
      continue;
    }
    if (current.value == null || ["string", "number", "boolean"].includes(typeof current.value)) continue;
    if (typeof current.value !== "object") {
      throw new AnalysisHistoryError("UNSUPPORTED_INPUT_VALUE", `Unsupported analysis value at ${current.path}.`);
    }
    if (ancestors.has(current.value)) {
      throw new AnalysisHistoryError("CYCLIC_ANALYSIS_INPUT", `Cyclic analysis input at ${current.path}.`);
    }
    ancestors.add(current.value);
    stack.push({ value: current.value, path: current.path, exit: true });

    if (!Array.isArray(current.value)) {
      const prototype = Object.getPrototypeOf(current.value);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new AnalysisHistoryError("UNSAFE_ANALYSIS_OBJECT", `Analysis input at ${current.path} must be a plain object.`);
      }
    }

    for (const key of Object.keys(current.value)) {
      const nextPath = Array.isArray(current.value) ? `${current.path}[${key}]` : `${current.path}.${key}`;
      if (PROHIBITED_OBJECT_KEYS.has(key)) {
        throw new AnalysisHistoryError("PROHIBITED_ANALYSIS_FIELD", `Prohibited analysis field at ${nextPath}.`, { path: nextPath });
      }
      if (!Array.isArray(current.value) && AUTHORITY_FIELD_KEYS.has(normalizedKey(key))) {
        throw new AnalysisHistoryError(
          "AUTHORITY_FIELD_REJECTED",
          "Authentication, owner, role, session, token, and security authority cannot be supplied through analysis input.",
          { path: nextPath },
        );
      }
      stack.push({ value: current.value[key], path: nextPath });
    }
  }
  return value;
}

function requiredText(value, field) {
  const text = String(value || "").trim();
  if (!text) throw new AnalysisHistoryError("ANALYSIS_FIELD_REQUIRED", `${field} is required.`, { field });
  return text;
}

function normalizeInputHash(value) {
  const hash = String(value || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hash)) {
    throw new AnalysisHistoryError("INVALID_INPUT_HASH", "Analysis inputHash must be a SHA-256 hexadecimal digest.");
  }
  return hash;
}

function normalizeWarnings(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new AnalysisHistoryError("INVALID_WARNINGS", "Analysis warnings must be an array.");
  return clone(value);
}

function emptyOwnerReview() {
  return {
    status: "PENDING",
    ownerConfirmedCondition: null,
    manualValues: {},
    dismissedWarningCodes: [],
    corrections: [],
    carriedFrom: null,
  };
}

function normalizeOwnerReview(value) {
  const review = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    ...emptyOwnerReview(),
    ...clone(review),
    manualValues: review.manualValues && typeof review.manualValues === "object" && !Array.isArray(review.manualValues)
      ? clone(review.manualValues)
      : {},
    dismissedWarningCodes: Array.isArray(review.dismissedWarningCodes)
      ? [...new Set(review.dismissedWarningCodes.map((entry) => String(entry).trim()).filter(Boolean))]
      : [],
    corrections: Array.isArray(review.corrections) ? clone(review.corrections) : [],
  };
}

function isIntelligenceAnalysis(record) {
  return record?.recordType === INTELLIGENCE_ANALYSIS_RECORD_TYPE
    && record?.format === INTELLIGENCE_ANALYSIS_FORMAT;
}

export async function hashAnalysisInput(normalizedInput, hashImplementation) {
  assertAnalysisInputHasNoAuthorityFields(normalizedInput);
  return hashCanonicalJson(normalizedInput, hashImplementation);
}

async function verifyAnalysisInputIntegrity(input) {
  if (input.normalizedInput == null) {
    throw new AnalysisHistoryError(
      "NORMALIZED_INPUT_REQUIRED",
      "Analysis history requires the exact normalized input used by the system result.",
    );
  }
  const suppliedInputHash = normalizeInputHash(input.inputHash);
  const calculatedInputHash = await hashAnalysisInput(input.normalizedInput);
  if (suppliedInputHash !== calculatedInputHash) {
    throw new AnalysisHistoryError(
      "INPUT_HASH_MISMATCH",
      "The supplied analysis input hash does not match the normalized input.",
    );
  }

  const systemResult = input.systemResult ?? input.result;
  if (systemResult && Object.prototype.hasOwnProperty.call(systemResult, "inputHash")) {
    const systemInputHash = normalizeInputHash(systemResult.inputHash);
    if (systemInputHash !== calculatedInputHash) {
      throw new AnalysisHistoryError(
        "SYSTEM_RESULT_INPUT_HASH_MISMATCH",
        "The system result input hash does not match the normalized input.",
      );
    }
  }
  if (systemResult?.normalizedInput != null) {
    const systemNormalizedInputHash = await hashAnalysisInput(systemResult.normalizedInput);
    if (systemNormalizedInputHash !== calculatedInputHash) {
      throw new AnalysisHistoryError(
        "SYSTEM_RESULT_INPUT_MISMATCH",
        "The normalized input embedded in the system result does not match the history input.",
      );
    }
  }
  return calculatedInputHash;
}

function normalizeManualValues(value, systemMoney) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AnalysisHistoryError("INVALID_MANUAL_VALUES", "Owner manual values must be a plain object.");
  }
  const normalized = clone(value);
  if (!Object.prototype.hasOwnProperty.call(value, "estimatedValue")) {
    return { values: normalized, clearedEstimatedValue: false };
  }
  if (value.estimatedValue == null || value.estimatedValue === "") {
    delete normalized.estimatedValue;
    return { values: normalized, clearedEstimatedValue: true };
  }

  try {
    normalized.estimatedValue = assertMoney(value.estimatedValue, {
      field: "manualValues.estimatedValue",
    });
  } catch (error) {
    throw new AnalysisHistoryError(
      "INVALID_MANUAL_ESTIMATED_VALUE",
      "Owner-entered estimated value must use non-negative safe integer minor units and a valid currency.",
      { moneyErrorCode: error?.code || "INVALID_MONEY" },
    );
  }
  if (systemMoney?.currency && normalized.estimatedValue.currency !== systemMoney.currency) {
    throw new AnalysisHistoryError(
      "MANUAL_VALUE_CURRENCY_MISMATCH",
      "Owner-entered estimated value must use the analysis currency.",
    );
  }
  return { values: normalized, clearedEstimatedValue: false };
}

function systemConditionFrom(record) {
  const condition = record?.systemResult?.condition;
  if (typeof condition === "string") return condition;
  return condition?.resolvedCondition
    || condition?.ownerConfirmedCondition
    || condition?.systemProposal?.proposedCondition
    || condition?.systemProposal?.condition
    || condition?.proposedCondition
    || "Unknown";
}

function resolvedConditionFrom(record) {
  return record?.ownerReview?.ownerConfirmedCondition || systemConditionFrom(record);
}

function systemMoneyFrom(record) {
  const candidates = [
    record?.systemResult?.valuation?.conditionAdjustedValue,
    record?.systemResult?.valuation?.expectedValue,
    record?.systemResult?.valuation?.predictedResale?.median,
    record?.systemResult?.dealIntelligence?.expectedResaleValue,
    record?.systemResult?.dealIntelligence?.estimatedResaleValue,
    record?.systemResult?.estimatedValue,
  ];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const amountMinor = Number(candidate.amountMinor ?? candidate.minorUnits);
    const currency = String(candidate.currency || "").trim().toUpperCase();
    if (Number.isSafeInteger(amountMinor) && currency) return { amountMinor, currency };
  }
  return null;
}

function resolvedMoneyFrom(record) {
  const manual = record?.ownerReview?.manualValues?.estimatedValue;
  if (manual && typeof manual === "object") {
    const amountMinor = Number(manual.amountMinor ?? manual.minorUnits);
    const currency = String(manual.currency || "").trim().toUpperCase();
    if (Number.isSafeInteger(amountMinor) && currency) return { amountMinor, currency };
  }
  return systemMoneyFrom(record);
}

function formatMoney(value) {
  if (!value) return "value unavailable";
  try {
    return formatMoneyForDisplay({ minorUnits: value.amountMinor, currency: value.currency });
  } catch {
    try {
      return `${value.currency} ${minorUnitsToMajorString(value.amountMinor)}`;
    } catch {
      return "value unavailable";
    }
  }
}

function identityFrom(record) {
  const identity = record?.sourceInput?.identity;
  return identity && typeof identity === "object" && !Array.isArray(identity) ? clone(identity) : null;
}

function changedIdentityFields(previousIdentity, currentIdentity) {
  const keys = [...new Set([
    ...Object.keys(previousIdentity || {}),
    ...Object.keys(currentIdentity || {}),
  ])].sort();
  return keys.filter((key) => JSON.stringify(previousIdentity?.[key]) !== JSON.stringify(currentIdentity?.[key]));
}

function comparisonReason(previous, current, changes, identityFieldsChanged) {
  const explicit = current?.systemResult?.comparisonReason;
  if (explicit) return String(explicit);
  if (changes.includes("IDENTITY")) {
    return identityFieldsChanged.length
      ? `The product identity changed (${identityFieldsChanged.join(", ")}).`
      : "The product identity changed.";
  }
  if (changes.includes("CONDITION")) {
    const conditionReason = current?.systemResult?.condition?.comparisonReason
      || current?.systemResult?.condition?.explanation;
    return conditionReason
      ? String(conditionReason)
      : "The condition evidence or owner-confirmed condition changed.";
  }
  if (changes.includes("VALUE")) {
    const valueReason = current?.systemResult?.valuation?.comparisonReason
      || current?.systemResult?.dealIntelligence?.comparisonReason;
    return valueReason
      ? String(valueReason)
      : "The valuation evidence or assumptions changed.";
  }
  if (previous?.inputHash !== current?.inputHash) return "The normalized analysis input changed.";
  return "The recorded result did not materially change.";
}

/** Compare two adjacent immutable system revisions without changing either one. */
export function compareAdjacentAnalyses(previous, current) {
  if (!isIntelligenceAnalysis(previous) || !isIntelligenceAnalysis(current)) {
    throw new AnalysisHistoryError("INVALID_ANALYSIS_RECORD", "Both comparison records must be Code 3 intelligence analyses.");
  }
  if (previous.analysisSeriesId !== current.analysisSeriesId
    || current.previousAnalysisId !== previous.id
    || current.revision !== previous.revision + 1) {
    throw new AnalysisHistoryError("ANALYSES_NOT_ADJACENT", "Analysis comparison requires adjacent revisions from one series.");
  }

  const previousCondition = systemConditionFrom(previous);
  const currentCondition = systemConditionFrom(current);
  const previousValue = systemMoneyFrom(previous);
  const currentValue = systemMoneyFrom(current);
  const previousIdentity = identityFrom(previous);
  const currentIdentity = identityFrom(current);
  const identityFieldsChanged = changedIdentityFields(previousIdentity, currentIdentity);
  const changes = [];
  if (identityFieldsChanged.length) changes.push("IDENTITY");
  if (previousCondition !== currentCondition) changes.push("CONDITION");
  if (JSON.stringify(previousValue) !== JSON.stringify(currentValue)) changes.push("VALUE");
  if (previous.inputHash !== current.inputHash) changes.push("INPUT");
  const reason = comparisonReason(previous, current, changes, identityFieldsChanged);

  return Object.freeze({
    previousAnalysisId: previous.id,
    currentAnalysisId: current.id,
    previous: {
      condition: previousCondition,
      value: clone(previousValue),
      identity: previousIdentity,
      resolvedCondition: resolvedConditionFrom(previous),
      resolvedValue: clone(resolvedMoneyFrom(previous)),
    },
    current: {
      condition: currentCondition,
      value: clone(currentValue),
      identity: currentIdentity,
      resolvedCondition: resolvedConditionFrom(current),
      resolvedValue: clone(resolvedMoneyFrom(current)),
    },
    changes,
    identityFieldsChanged,
    reason,
    summary: `Previous analysis: ${previousCondition} / ${formatMoney(previousValue)}. Current analysis: ${currentCondition} / ${formatMoney(currentValue)}. Reason: ${reason}`,
  });
}

function createRecordPayload(input, context) {
  assertAnalysisInputHasNoAuthorityFields(input);
  const systemResult = input.systemResult ?? input.result;
  if (!systemResult || typeof systemResult !== "object" || Array.isArray(systemResult)) {
    throw new AnalysisHistoryError("SYSTEM_RESULT_REQUIRED", "A structured systemResult is required for analysis history.");
  }
  const timestamp = input.analyzedAt || context.timestamp;
  if (!Number.isFinite(Date.parse(timestamp))) {
    throw new AnalysisHistoryError("INVALID_ANALYSIS_TIMESTAMP", "analyzedAt must be a valid timestamp.");
  }

  return {
    id: context.id,
    recordType: INTELLIGENCE_ANALYSIS_RECORD_TYPE,
    format: INTELLIGENCE_ANALYSIS_FORMAT,
    status: "ACTIVE",
    analysisType: requiredText(input.analysisType, "analysisType").toUpperCase(),
    analysisSeriesId: context.seriesId,
    revision: context.revision,
    previousAnalysisId: context.previousAnalysisId,
    methodologyVersion: requiredText(input.methodologyVersion, "methodologyVersion"),
    inputHash: normalizeInputHash(input.inputHash),
    analyzedAt: new Date(timestamp).toISOString(),
    sourceInput: input.normalizedInput == null ? null : clone(input.normalizedInput),
    workflowSnapshot: input.workflowSnapshot == null ? null : clone(input.workflowSnapshot),
    sourceReferences: Array.isArray(input.sourceReferences) ? clone(input.sourceReferences) : [],
    evidence: input.evidence == null ? null : clone(input.evidence),
    systemResult: clone(systemResult),
    warnings: normalizeWarnings(input.warnings ?? systemResult.warnings),
    ownerReview: context.ownerReview,
  };
}

function carryOwnerReview(previous, carriedAt) {
  const review = normalizeOwnerReview(previous.ownerReview);
  return {
    ...review,
    status: review.ownerConfirmedCondition || Object.keys(review.manualValues).length || review.corrections.length
      ? "REVIEW_REQUIRED_AFTER_REANALYSIS"
      : "PENDING",
    carriedFrom: {
      analysisId: previous.id,
      recordVersion: previous.recordVersion,
      carriedAt,
    },
  };
}

/**
 * Build the only Phase 1C history store. Its mode is intentionally not a
 * caller option: it always wraps the existing appraisals collection in the
 * Phase 1B LOCAL_ONLY persistence gateway and never constructs a remote
 * adapter.
 */
export function createLocalAnalysisHistory(options = {}) {
  if (Object.prototype.hasOwnProperty.call(options, "mode")
    || Object.prototype.hasOwnProperty.call(options, "remoteDataSource")
    || Object.prototype.hasOwnProperty.call(options, "request")) {
    throw new AnalysisHistoryError(
      "PERSISTENCE_MODE_NOT_CALLER_SELECTABLE",
      "Intelligence history is fixed to LOCAL_ONLY until a separately approved owner-confirmed cutover.",
    );
  }
  if (!options.repository?.load || !options.repository?.save) {
      throw new AnalysisHistoryError("LOCAL_REPOSITORY_REQUIRED", "The existing local analysis repository is required.");
  }

  const now = options.now || (() => new Date().toISOString());
  const idFactory = options.idFactory || ((prefix) => `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`);
  const newId = (prefix) => requiredText(idFactory(prefix), `${prefix} id`);
  const localDataSource = createLocalCollectionDataSource({
    repository: options.repository,
    collection: "appraisals",
    now,
    idFactory: () => newId("analysis"),
  });
  const gateway = createPersistenceGateway({
    mode: PERSISTENCE_MODES.LOCAL_ONLY,
    localDataSource,
  });

  async function allRecords() {
    const records = [];
    let cursor = null;
    for (let page = 0; page < 100; page += 1) {
      const result = await gateway.list({ limit: 100, cursor, includeArchived: true });
      records.push(...result.records);
      cursor = result.nextCursor;
      if (!cursor) return records;
    }
    throw new AnalysisHistoryError("HISTORY_LIMIT_EXCEEDED", "Analysis history exceeds the bounded local read limit.");
  }

  async function getAnalysis(id) {
    const record = await gateway.getById(requiredText(id, "analysis id"));
    return isIntelligenceAnalysis(record) ? record : null;
  }

  async function listAnalyses(query = {}) {
    assertAnalysisInputHasNoAuthorityFields(query);
    const records = (await allRecords())
      .filter(isIntelligenceAnalysis)
      .filter((record) => !query.analysisSeriesId || record.analysisSeriesId === query.analysisSeriesId)
      .filter((record) => !query.analysisType || record.analysisType === String(query.analysisType).toUpperCase())
      .sort((left, right) => Number(right.revision) - Number(left.revision)
        || String(right.analyzedAt).localeCompare(String(left.analyzedAt))
        || String(right.id).localeCompare(String(left.id)));
    const limit = Number.isInteger(query.limit) && query.limit > 0 ? Math.min(query.limit, 500) : records.length;
    return records.slice(0, limit).map(clone);
  }

  async function createAnalysis(input) {
    assertAnalysisInputHasNoAuthorityFields(input);
    await verifyAnalysisInputIntegrity(input);
    const id = newId("analysis");
    const timestamp = now();
    const payload = createRecordPayload(input, {
      id,
      seriesId: `analysis-series:${id}`,
      revision: 1,
      previousAnalysisId: null,
      timestamp,
      ownerReview: emptyOwnerReview(),
    });
    return gateway.create(payload);
  }

  async function reanalyze(previousId, input) {
    assertAnalysisInputHasNoAuthorityFields(input);
    const previous = await getAnalysis(previousId);
    if (!previous) throw new AnalysisHistoryError("ANALYSIS_NOT_FOUND", "The prior analysis revision was not found.");
    const series = await listAnalyses({ analysisSeriesId: previous.analysisSeriesId });
    const latest = series[0];
    if (latest?.id !== previous.id) {
      throw new AnalysisHistoryError("HISTORY_BASE_NOT_LATEST", "Reanalysis must start from the latest revision in the series.");
    }
    await verifyAnalysisInputIntegrity(input);
    const timestamp = now();
    const payload = createRecordPayload(input, {
      id: newId("analysis"),
      seriesId: previous.analysisSeriesId,
      revision: previous.revision + 1,
      previousAnalysisId: previous.id,
      timestamp,
      ownerReview: carryOwnerReview(previous, timestamp),
    });
    return gateway.create(payload);
  }

  async function recordOwnerCorrection(id, correction, expectedVersion) {
    assertAnalysisInputHasNoAuthorityFields(correction);
    const record = await getAnalysis(id);
    if (!record) throw new AnalysisHistoryError("ANALYSIS_NOT_FOUND", "The analysis revision was not found.");
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
      throw new AnalysisHistoryError("EXPECTED_VERSION_REQUIRED", "Owner review requires the loaded record version.");
    }

    const current = normalizeOwnerReview(record.ownerReview);
    const next = clone(current);
    const change = {};
    if (Object.prototype.hasOwnProperty.call(correction, "confirmedCondition")) {
      const condition = String(correction.confirmedCondition || "").trim().toUpperCase();
      if (condition && !CONDITION_VALUES.has(condition)) {
        throw new AnalysisHistoryError("INVALID_CONFIRMED_CONDITION", "Owner-confirmed condition must be NM, LP, MP, HP, or DMG.");
      }
      change.ownerConfirmedCondition = {
        previousValue: next.ownerConfirmedCondition,
        newValue: condition || null,
      };
      next.ownerConfirmedCondition = condition || null;
    }
    if (Object.prototype.hasOwnProperty.call(correction, "manualValues")) {
      const { values: normalizedManualValues, clearedEstimatedValue } = normalizeManualValues(
        correction.manualValues,
        systemMoneyFrom(record),
      );
      const priorManualValues = clone(next.manualValues);
      next.manualValues = { ...next.manualValues, ...normalizedManualValues };
      if (clearedEstimatedValue) delete next.manualValues.estimatedValue;
      const changedManualKeys = [
        ...new Set([
          ...Object.keys(normalizedManualValues),
          ...(clearedEstimatedValue ? ["estimatedValue"] : []),
        ]),
      ];
      change.manualValues = Object.fromEntries(changedManualKeys.map((key) => [
        key,
        {
          previousValue: Object.prototype.hasOwnProperty.call(priorManualValues, key) ? priorManualValues[key] : null,
          newValue: Object.prototype.hasOwnProperty.call(next.manualValues, key) ? clone(next.manualValues[key]) : null,
        },
      ]));
    }
    if (Object.prototype.hasOwnProperty.call(correction, "dismissedWarningCodes")) {
      if (!Array.isArray(correction.dismissedWarningCodes)) {
        throw new AnalysisHistoryError("INVALID_DISMISSED_WARNINGS", "Dismissed warning codes must be an array.");
      }
      const priorDismissedWarningCodes = clone(next.dismissedWarningCodes);
      next.dismissedWarningCodes = [...new Set(
        correction.dismissedWarningCodes.map((entry) => String(entry).trim()).filter(Boolean),
      )];
      change.dismissedWarningCodes = {
        previousValue: priorDismissedWarningCodes,
        newValue: clone(next.dismissedWarningCodes),
      };
    }
    const note = String(correction.note || "").trim();
    if (note) change.note = { previousValue: null, newValue: note.slice(0, 2_000) };
    if (!Object.keys(change).length) {
      throw new AnalysisHistoryError("OWNER_CORRECTION_EMPTY", "An owner correction must confirm or change at least one review value.");
    }

    const correctedAt = now();
    next.status = correction.reviewStatus === "CONFIRMED" ? "CONFIRMED" : "CORRECTED";
    next.carriedFrom = current.carriedFrom;
    next.corrections = [
      ...current.corrections,
      {
        correctionId: newId("owner-correction"),
        source: "OWNER_ENTERED",
        correctedAt,
        changes: change,
      },
    ];

    // Deliberately update only ownerReview. The immutable system proposal and
    // source evidence are never merged from owner input.
    return gateway.update(record.id, { ownerReview: next }, expectedVersion);
  }

  async function compareWithPrevious(id) {
    const current = await getAnalysis(id);
    if (!current) throw new AnalysisHistoryError("ANALYSIS_NOT_FOUND", "The analysis revision was not found.");
    if (!current.previousAnalysisId) return null;
    const previous = await getAnalysis(current.previousAnalysisId);
    if (!previous) throw new AnalysisHistoryError("PREVIOUS_ANALYSIS_NOT_FOUND", "The prior analysis revision is unavailable.");
    return compareAdjacentAnalyses(previous, current);
  }

  return Object.freeze({
    mode: gateway.mode,
    persistenceTarget: gateway.persistenceTarget,
    createAnalysis,
    reanalyze,
    recordOwnerCorrection,
    listAnalyses,
    getAnalysis,
    compareWithPrevious,
  });
}
