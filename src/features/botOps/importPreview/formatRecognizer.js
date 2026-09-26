import {
  STELLAR_PREVIEW_FORMAT_STATES,
  STELLAR_PREVIEW_GROUP_FIELDS,
  STELLAR_PREVIEW_LIMITS,
  STELLAR_PREVIEW_ROOT_FIELDS,
} from "./constants.js";

const VERSION_FIELDS = new Set(["version", "formatVersion", "format_version", "schemaVersion", "schema_version"]);

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function boundedUnknownFields(keys, allowlist, maximum) {
  const allowed = new Set(allowlist);
  return keys.filter((key) => !allowed.has(key)).slice(0, maximum);
}

function unknownResult(notes = []) {
  return Object.freeze({
    state: STELLAR_PREVIEW_FORMAT_STATES.UNKNOWN_FORMAT,
    records: Object.freeze([]),
    sourceRecordCount: 0,
    ignoredRootFields: Object.freeze([]),
    compatibilityNotes: Object.freeze(notes),
  });
}

function recordLimitResult(maximumRecords) {
  return Object.freeze({
    state: STELLAR_PREVIEW_FORMAT_STATES.REJECTED,
    records: Object.freeze([]),
    sourceRecordCount: 0,
    ignoredRootFields: Object.freeze([]),
    compatibilityNotes: Object.freeze([
      `The export contains more than the ${maximumRecords}-record offline preview limit.`,
    ]),
  });
}

/**
 * Recognizes bounded structural candidates only. No current public Stellar
 * schema/version is verified, so this function intentionally never emits
 * SUPPORTED.
 */
export function recognizeStellarTaskExportFormat(value, limitOverrides = {}) {
  const limits = { ...STELLAR_PREVIEW_LIMITS, ...limitOverrides };
  if (Array.isArray(value)) {
    return Object.freeze({
      state: STELLAR_PREVIEW_FORMAT_STATES.PARTIALLY_RECOGNIZED,
      records: Object.freeze(value.map((record) => Object.freeze({ record, group: null }))),
      sourceRecordCount: value.length,
      ignoredRootFields: Object.freeze([]),
      compatibilityNotes: Object.freeze([
        "A top-level task array can be screened, but no current Stellar schema or version marker is verified.",
      ]),
    });
  }
  if (!isPlainObject(value)) {
    return unknownResult(["The JSON root is not a recognized task-array or task-group envelope."]);
  }

  const rootKeys = Object.keys(value);
  if (rootKeys.some((key) => VERSION_FIELDS.has(key))) {
    return Object.freeze({
      ...unknownResult(["The export declares a version that Code 3 has not verified."]),
      ignoredRootFields: Object.freeze(boundedUnknownFields(rootKeys, STELLAR_PREVIEW_ROOT_FIELDS, limits.maximumUnknownFields)),
    });
  }
  const hasTasks = Object.hasOwn(value, "tasks");
  const hasGroups = Object.hasOwn(value, "taskGroups");
  if (hasTasks && hasGroups) {
    return unknownResult(["The JSON contains multiple competing task containers."]);
  }
  if (hasTasks) {
    if (!Array.isArray(value.tasks)) return unknownResult(["The tasks container is not an array."]);
    return Object.freeze({
      state: STELLAR_PREVIEW_FORMAT_STATES.PARTIALLY_RECOGNIZED,
      records: Object.freeze(value.tasks.map((record) => Object.freeze({ record, group: null }))),
      sourceRecordCount: value.tasks.length,
      ignoredRootFields: Object.freeze(boundedUnknownFields(rootKeys, STELLAR_PREVIEW_ROOT_FIELDS, limits.maximumUnknownFields)),
      compatibilityNotes: Object.freeze([
        "A tasks envelope can be screened, but its provider schema and Stellar-version compatibility are unverified.",
      ]),
    });
  }
  if (hasGroups) {
    if (!Array.isArray(value.taskGroups)) return unknownResult(["The taskGroups container is not an array."]);
    const records = [];
    const ignoredGroupFields = new Set();
    for (const group of value.taskGroups) {
      if (!isPlainObject(group) || !Array.isArray(group.tasks)) {
        return unknownResult(["At least one task-group entry does not contain a task array."]);
      }
      for (const key of boundedUnknownFields(Object.keys(group), STELLAR_PREVIEW_GROUP_FIELDS, limits.maximumUnknownFields)) {
        ignoredGroupFields.add(key);
      }
      for (const record of group.tasks) {
        if (records.length >= limits.maximumRecords) return recordLimitResult(limits.maximumRecords);
        records.push(Object.freeze({ record, group }));
      }
    }
    return Object.freeze({
      state: STELLAR_PREVIEW_FORMAT_STATES.PARTIALLY_RECOGNIZED,
      records: Object.freeze(records),
      sourceRecordCount: records.length,
      ignoredRootFields: Object.freeze([
        ...boundedUnknownFields(rootKeys, STELLAR_PREVIEW_ROOT_FIELDS, limits.maximumUnknownFields),
        ...[...ignoredGroupFields],
      ].slice(0, limits.maximumUnknownFields)),
      compatibilityNotes: Object.freeze([
        "A task-group envelope can be screened, but its provider schema and Stellar-version compatibility are unverified.",
      ]),
    });
  }
  return Object.freeze({
    ...unknownResult(["No recognized task container is present."]),
    ignoredRootFields: Object.freeze(rootKeys.slice(0, limits.maximumUnknownFields)),
  });
}
