// Improvement #80: before a backup is accepted, explain schema/version
// compatibility per source and summarize what a restore would do. This module is
// presentation-oriented data only. It never writes, never relaxes validation, and
// never replaces the strict checks in restorePreview.js / workspaceRecovery.js.
import { CODE3_BACKUP_FORMAT, CODE3_BACKUP_FORMAT_VERSION } from "./backupFormat.js";
import { BACKUP_SOURCE_REGISTRY, getBackupSource } from "./backupSourceRegistry.js";
import { enumerateSectionRecords } from "./restorePreview.js";
import { canonicalStringify } from "./canonicalJson.js";

export const FORMAT_COMPATIBILITY = Object.freeze({
  COMPATIBLE: "COMPATIBLE",
  UNRECOGNIZED: "UNRECOGNIZED",
  NEWER_THAN_SUPPORTED: "NEWER_THAN_SUPPORTED",
  OLDER_UNSUPPORTED: "OLDER_UNSUPPORTED",
});

export const SOURCE_COMPATIBILITY = Object.freeze({
  COMPATIBLE: "COMPATIBLE",
  NEWER_THAN_SUPPORTED: "NEWER_THAN_SUPPORTED",
  OLDER_UNSUPPORTED: "OLDER_UNSUPPORTED",
  UNKNOWN_SOURCE: "UNKNOWN_SOURCE",
  INVALID_VERSION: "INVALID_VERSION",
});

export const APPLICATION_VERSION_RELATION = Object.freeze({
  SAME: "SAME",
  BACKUP_NEWER: "BACKUP_NEWER",
  BACKUP_OLDER: "BACKUP_OLDER",
  UNKNOWN: "UNKNOWN",
});

export const COMPATIBILITY_STATUS = Object.freeze({
  COMPATIBLE: "COMPATIBLE",
  COMPATIBLE_WITH_NOTES: "COMPATIBLE_WITH_NOTES",
  UNSUPPORTED: "UNSUPPORTED",
  UNRECOGNIZED: "UNRECOGNIZED",
});

const MAX_SOURCE_ROWS = 100;

function safeText(value, limit = 120) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  // Control characters are stripped on purpose from untrusted backup text.
  // eslint-disable-next-line no-control-regex
  const clean = String(value).replace(/[\u0000-\u001f]/g, " ").trim();
  return clean.length > limit ? `${clean.slice(0, limit)}…` : clean;
}

function parseVersionParts(version) {
  const text = safeText(version, 64);
  const match = text.match(/^v?(\d+(?:\.\d+)*)(?:[-+].*)?$/i);
  if (!match) return null;
  return match[1].split(".").map((part) => Number(part));
}

export function compareApplicationVersions(backupVersion, currentVersion) {
  const left = parseVersionParts(backupVersion);
  const right = parseVersionParts(currentVersion);
  if (!left || !right) return APPLICATION_VERSION_RELATION.UNKNOWN;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    if (a > b) return APPLICATION_VERSION_RELATION.BACKUP_NEWER;
    if (a < b) return APPLICATION_VERSION_RELATION.BACKUP_OLDER;
  }
  return APPLICATION_VERSION_RELATION.SAME;
}

export function describeVersionList(versions) {
  const list = Array.isArray(versions) ? versions.filter(Number.isInteger).sort((a, b) => a - b) : [];
  if (!list.length) return "none";
  if (list.length === 1) return String(list[0]);
  const contiguous = list.every((version, index) => index === 0 || version === list[index - 1] + 1);
  return contiguous ? `${list[0]}–${list[list.length - 1]}` : list.join(", ");
}

function sourceStatus(source, schemaVersion) {
  if (!source) return SOURCE_COMPATIBILITY.UNKNOWN_SOURCE;
  if (!Number.isInteger(schemaVersion)) return SOURCE_COMPATIBILITY.INVALID_VERSION;
  const supported = Array.isArray(source.supportedSchemaVersions) ? source.supportedSchemaVersions : [];
  if (supported.includes(schemaVersion)) return SOURCE_COMPATIBILITY.COMPATIBLE;
  const newest = supported.length ? Math.max(...supported) : null;
  if (newest !== null && schemaVersion > newest) return SOURCE_COMPATIBILITY.NEWER_THAN_SUPPORTED;
  return SOURCE_COMPATIBILITY.OLDER_UNSUPPORTED;
}

function formatStatus(backup) {
  if (backup?.format !== CODE3_BACKUP_FORMAT) return FORMAT_COMPATIBILITY.UNRECOGNIZED;
  if (backup.formatVersion === CODE3_BACKUP_FORMAT_VERSION) return FORMAT_COMPATIBILITY.COMPATIBLE;
  if (Number.isInteger(backup.formatVersion) && backup.formatVersion > CODE3_BACKUP_FORMAT_VERSION) return FORMAT_COMPATIBILITY.NEWER_THAN_SUPPORTED;
  return FORMAT_COMPATIBILITY.OLDER_UNSUPPORTED;
}

export function describeSourceCompatibility(row) {
  const name = row.displayName || row.sourceId || "This source";
  switch (row.status) {
    case SOURCE_COMPATIBILITY.COMPATIBLE:
      return row.restorable === false
        ? `${name} (version ${row.schemaVersion}) is readable, but it is not restored by this recovery. Keep the backup for that source.`
        : `${name} uses version ${row.schemaVersion}, which this app reads.`;
    case SOURCE_COMPATIBILITY.NEWER_THAN_SUPPORTED:
      return `${name} was saved with version ${row.schemaVersion}. This app reads versions ${describeVersionList(row.supportedSchemaVersions)}. Update the app before restoring this backup.`;
    case SOURCE_COMPATIBILITY.OLDER_UNSUPPORTED:
      return `${name} was saved with version ${row.schemaVersion}, which this app no longer reads (supported: ${describeVersionList(row.supportedSchemaVersions)}). Open it in the version that created it and export again.`;
    case SOURCE_COMPATIBILITY.INVALID_VERSION:
      return `${name} does not declare a valid schema version, so it cannot be checked.`;
    case SOURCE_COMPATIBILITY.UNKNOWN_SOURCE:
    default:
      return `${name} is not a source this app knows. It will stay in the backup file and will not be restored.`;
  }
}

export function describeApplicationVersion(application) {
  const backupVersion = application?.backupVersion || "unknown";
  const currentVersion = application?.currentVersion || "unknown";
  switch (application?.relation) {
    case APPLICATION_VERSION_RELATION.SAME:
      return `Saved by this app version (${backupVersion}).`;
    case APPLICATION_VERSION_RELATION.BACKUP_NEWER:
      return `Saved by a newer app version (${backupVersion}) than this one (${currentVersion}). Newer records may be read with reduced detail; update the app if a source is marked unsupported.`;
    case APPLICATION_VERSION_RELATION.BACKUP_OLDER:
      return `Saved by an older app version (${backupVersion}); this app is ${currentVersion}. Older records are read through their supported schema versions.`;
    default:
      return `App version comparison is not available (backup: ${backupVersion}; this app: ${currentVersion}).`;
  }
}

export function describeCompatibilityFailure(compatibility) {
  if (!compatibility) return "The backup did not pass integrity, schema, and record validation.";
  if (compatibility.format.status === FORMAT_COMPATIBILITY.UNRECOGNIZED) return "This file is not a Code 3 backup, so its contents cannot be checked or restored.";
  if (compatibility.format.status === FORMAT_COMPATIBILITY.NEWER_THAN_SUPPORTED) {
    return `This backup uses format version ${compatibility.format.formatVersion}; this app reads version ${compatibility.format.supportedFormatVersion}. Update the app before restoring it.`;
  }
  if (compatibility.format.status === FORMAT_COMPATIBILITY.OLDER_UNSUPPORTED) {
    return `This backup uses format version ${compatibility.format.formatVersion ?? "unknown"}, which this app no longer reads (supported: ${compatibility.format.supportedFormatVersion}).`;
  }
  const blocking = compatibility.sources.filter((row) => [
    SOURCE_COMPATIBILITY.NEWER_THAN_SUPPORTED, SOURCE_COMPATIBILITY.OLDER_UNSUPPORTED, SOURCE_COMPATIBILITY.INVALID_VERSION,
  ].includes(row.status));
  if (blocking.length) {
    const first = describeSourceCompatibility(blocking[0]);
    return blocking.length > 1 ? `${first} ${blocking.length - 1} more source(s) have the same kind of problem.` : first;
  }
  return "The backup did not pass integrity, schema, and record validation.";
}

// `backup` is the parsed (untrusted but bounded) envelope. `restorableSourceIds`
// narrows which registry sources the current recovery actually writes; the rest
// are reported as readable-but-not-restored so the owner keeps the file.
export function summarizeBackupCompatibility(backup, {
  sourceRegistry = BACKUP_SOURCE_REGISTRY,
  restorableSourceIds = null,
  currentApplicationVersion = "unknown",
} = {}) {
  const format = {
    recognized: backup?.format === CODE3_BACKUP_FORMAT,
    formatVersion: Number.isInteger(backup?.formatVersion) ? backup.formatVersion : null,
    supportedFormatVersion: CODE3_BACKUP_FORMAT_VERSION,
    status: formatStatus(backup),
  };
  const backupVersion = safeText(backup?.applicationVersion, 64) || "unknown";
  const application = {
    backupVersion,
    currentVersion: safeText(currentApplicationVersion, 64) || "unknown",
    createdAt: safeText(backup?.createdAt, 40) || null,
    relation: compareApplicationVersions(backupVersion, currentApplicationVersion),
  };
  const restorable = restorableSourceIds ? new Set(restorableSourceIds) : null;
  const sections = Array.isArray(backup?.sections) ? backup.sections.slice(0, MAX_SOURCE_ROWS) : [];
  const sources = sections.map((section) => {
    const sourceId = safeText(section?.sourceId, 80) || "unknown";
    const source = getBackupSource(sourceId, sourceRegistry);
    const schemaVersion = Number.isInteger(section?.schemaVersion) ? section.schemaVersion : null;
    const status = sourceStatus(source, schemaVersion);
    const row = {
      sourceId,
      displayName: source?.displayName || sourceId,
      schemaVersion,
      currentSchemaVersion: Number.isInteger(source?.schemaVersion) ? source.schemaVersion : null,
      supportedSchemaVersions: Array.isArray(source?.supportedSchemaVersions) ? [...source.supportedSchemaVersions] : [],
      recordCount: Number.isSafeInteger(section?.recordCount) ? section.recordCount : null,
      status,
      restorable: restorable ? restorable.has(sourceId) && status === SOURCE_COMPATIBILITY.COMPATIBLE : status === SOURCE_COMPATIBILITY.COMPATIBLE,
    };
    return { ...row, message: describeSourceCompatibility(row) };
  });

  const messages = [];
  let status = COMPATIBILITY_STATUS.COMPATIBLE;
  if (format.status === FORMAT_COMPATIBILITY.UNRECOGNIZED) status = COMPATIBILITY_STATUS.UNRECOGNIZED;
  else if (format.status !== FORMAT_COMPATIBILITY.COMPATIBLE) status = COMPATIBILITY_STATUS.UNSUPPORTED;
  else if (sources.some((row) => [SOURCE_COMPATIBILITY.NEWER_THAN_SUPPORTED, SOURCE_COMPATIBILITY.OLDER_UNSUPPORTED, SOURCE_COMPATIBILITY.INVALID_VERSION].includes(row.status))) {
    status = COMPATIBILITY_STATUS.UNSUPPORTED;
  } else if (
    sources.some((row) => row.status === SOURCE_COMPATIBILITY.UNKNOWN_SOURCE || row.restorable === false)
    || application.relation === APPLICATION_VERSION_RELATION.BACKUP_NEWER
    || (Array.isArray(backup?.sections) && backup.sections.length > MAX_SOURCE_ROWS)
  ) {
    status = COMPATIBILITY_STATUS.COMPATIBLE_WITH_NOTES;
  }

  if (status === COMPATIBILITY_STATUS.UNRECOGNIZED || status === COMPATIBILITY_STATUS.UNSUPPORTED) {
    messages.push(describeCompatibilityFailure({ format, sources }));
  }
  if (application.relation === APPLICATION_VERSION_RELATION.BACKUP_NEWER) messages.push(describeApplicationVersion(application));
  for (const row of sources) {
    if (row.status === SOURCE_COMPATIBILITY.UNKNOWN_SOURCE || (row.status === SOURCE_COMPATIBILITY.COMPATIBLE && row.restorable === false)) messages.push(row.message);
  }
  if (Array.isArray(backup?.sections) && backup.sections.length > MAX_SOURCE_ROWS) {
    messages.push(`Only the first ${MAX_SOURCE_ROWS} of ${backup.sections.length} sources are listed here.`);
  }

  return { status, format, application, sources, messages };
}

function stableRecordId(record) {
  for (const field of ["id", "recordId", "record_id", "postId", "post_id", "reportId", "report_id", "eventId", "event_id"]) {
    if (record?.[field] != null && String(record[field]).trim()) return String(record[field]);
  }
  return "";
}

function currentSectionData(currentSources, sourceId) {
  if (currentSources instanceof Map) return currentSources.get(sourceId);
  return currentSources?.[sourceId];
}

// Dry run: for each restorable section, how many backup records are already
// saved, how many are new, and how many differ from an existing record with the
// same stable ID (the additive restore keeps the existing version of those).
export function summarizeRestoreDryRun(sections, {
  sourceRegistry = BACKUP_SOURCE_REGISTRY,
  currentSources = {},
  restorableSourceIds = null,
} = {}) {
  const restorable = restorableSourceIds ? new Set(restorableSourceIds) : null;
  const rows = [];
  const totals = { backupRecords: 0, currentRecords: 0, newRecords: 0, matchingRecords: 0, existingVersionsKept: 0, recordsAfter: 0 };
  for (const section of (Array.isArray(sections) ? sections : []).slice(0, MAX_SOURCE_ROWS)) {
    const source = getBackupSource(section?.sourceId, sourceRegistry);
    if (!source) continue;
    if (restorable && !restorable.has(section.sourceId)) continue;
    if (!source.supportedSchemaVersions?.includes(section.schemaVersion)) continue;
    const incoming = enumerateSectionRecords(section, source);
    const currentData = currentSectionData(currentSources, section.sourceId);
    const current = enumerateSectionRecords({ sourceId: section.sourceId, data: currentData === undefined ? source.emptyValue : currentData }, source);
    const currentById = new Map();
    const currentJson = new Set();
    for (const row of current) {
      const id = stableRecordId(row.record);
      if (id) currentById.set(`${row.collection}:${id}`, row.record);
      else currentJson.add(`${row.collection}:${canonicalStringify(row.record)}`);
    }
    const row = { sourceId: section.sourceId, displayName: source.displayName, backupRecords: incoming.length, currentRecords: current.length, newRecords: 0, matchingRecords: 0, existingVersionsKept: 0, recordsAfter: 0 };
    for (const entry of incoming) {
      const id = stableRecordId(entry.record);
      const matched = id ? currentById.get(`${entry.collection}:${id}`) : null;
      if (!matched) {
        if (!id && currentJson.has(`${entry.collection}:${canonicalStringify(entry.record)}`)) row.matchingRecords += 1;
        else row.newRecords += 1;
      } else if (canonicalStringify(matched) === canonicalStringify(entry.record)) row.matchingRecords += 1;
      else row.existingVersionsKept += 1;
    }
    row.recordsAfter = row.currentRecords + row.newRecords;
    for (const key of Object.keys(totals)) totals[key] += row[key];
    // Sources that are empty on both sides add nothing to the decision; totals
    // still include them so the summary stays complete.
    if (row.backupRecords || row.currentRecords) rows.push(row);
  }
  return { sources: rows, totals };
}
