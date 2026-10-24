import { canonicalStringify, hashCanonicalJson, parseUntrustedBackupJson } from "./canonicalJson.js";
import { previewBackupRestore } from "./restorePreview.js";
import { countSourceRecords, createVerifiedBackup } from "./backupFormat.js";
import { BACKUP_SOURCE_REGISTRY } from "./backupSourceRegistry.js";
import { resolveSourceSchemaVersion, validateBackupCrossSourceRelationships, validateBackupSourceData } from "./backupValidation.js";
import { captureRecoverySources, WORKSPACE_LOCAL_SOURCES, WorkspaceRecoveryError } from "./workspaceRecovery.js";
import { projectSourceData } from "./sourceProjection.js";

function fail(code, message) { throw new WorkspaceRecoveryError(code, message); }
function same(left, right) { return canonicalStringify(left) === canonicalStringify(right); }
function idOf(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return null;
  const id = record.id ?? record.recordId ?? record.record_id ?? record.postId ?? record.reportId ?? record.eventId;
  return id == null || String(id).trim() === "" ? null : String(id);
}

// Restore is deliberately additive. Existing records (including every field on
// an existing ID) win. A changed backup version is a reported conflict, never an
// instruction to replace newer work or combine fields from different revisions.
function mergeMissing(current, incoming, findings, path) {
  if (current === undefined) return structuredClone(incoming);
  if (same(current, incoming)) return current;
  if (Array.isArray(current) && Array.isArray(incoming)) {
    const result = current.slice();
    const indexed = new Map(current.map((record) => [idOf(record), record]).filter(([id]) => id !== null));
    for (const record of incoming) {
      const id = idOf(record);
      if (id !== null && indexed.has(id)) {
        if (!same(indexed.get(id), record)) findings.conflicts.push({ path, id });
      } else if (!result.some((existing) => same(existing, record))) {
        result.push(structuredClone(record));
        if (id !== null) indexed.set(id, record);
      }
    }
    return result;
  }
  if (current && incoming && typeof current === "object" && typeof incoming === "object" && !Array.isArray(current) && !Array.isArray(incoming)) {
    const result = { ...current };
    for (const [key, value] of Object.entries(incoming)) result[key] = mergeMissing(current[key], value, findings, `${path}.${key}`);
    return result;
  }
  findings.retainedSettings += 1;
  return current;
}

export async function planWorkspaceRestore(raw, { storage, projectUrl } = {}) {
  const preview = await previewBackupRestore(raw, { projectUrl });
  if (!["READY_FOR_FUTURE_RESTORE", "READY_WITH_WARNINGS"].includes(preview.result)) fail("BACKUP_NOT_READY", preview.errors?.[0] || "The backup did not pass integrity, schema, and record validation.");
  const backup = parseUntrustedBackupJson(raw);
  const expectedSources = captureRecoverySources(storage, { projectUrl });
  const nextSources = {};
  const skippedSources = [];
  const findings = { conflicts: [], retainedSettings: 0 };
  let beforeRecords = 0;
  let afterRecords = 0;
  for (const section of backup.sections) {
    const source = WORKSPACE_LOCAL_SOURCES.find((candidate) => candidate.sourceId === section.sourceId);
    if (!source) { skippedSources.push(section.sourceId); continue; }
    const current = expectedSources[section.sourceId].data;
    const absent = source.storageKey ? storage.getItem(source.storageKey) === null : source.storageKeys.every((key) => storage.getItem(key) === null);
    const incoming = projectSourceData(source, section.data);
    const data = absent ? structuredClone(incoming) : mergeMissing(current, incoming, findings, section.sourceId);
    const validation = validateBackupSourceData(source, data);
    if (!validation.valid) fail("MERGED_DATA_INVALID", `${source.displayName} cannot be combined safely with the current records.`);
    nextSources[section.sourceId] = { schemaVersion: resolveSourceSchemaVersion(source, data), data };
    beforeRecords += countSourceRecords(current, source);
    afterRecords += countSourceRecords(data, source);
  }
  if (!Object.keys(nextSources).length) fail("NO_DEVICE_SOURCES", "This file does not contain recoverable device records.");
  const combined = { ...expectedSources, ...nextSources };
  const cross = validateBackupCrossSourceRelationships(Object.entries(combined).map(([sourceId, section]) => ({ sourceId, ...section })));
  if (!cross.valid) fail("MERGED_REFERENCES_INVALID", "The combined records have conflicting relationships. Your current data has not been changed.");
  const payload = {
    format: "code3-workspace-restore-plan", version: 1, strategy: "ADD_MISSING_KEEP_CURRENT",
    backupHash: await hashCanonicalJson(raw), beforeHash: await hashCanonicalJson(expectedSources), afterHash: await hashCanonicalJson(nextSources),
    addedRecords: afterRecords - beforeRecords, preservedConflicts: findings.conflicts.length, retainedSettings: findings.retainedSettings,
    sources: Object.keys(nextSources), skippedSources,
    fileReferencesNotIncluded: Math.max(0, Number(backup.coverageSummary?.fileReferences?.total || 0) - Number(backup.coverageSummary?.fileReferences?.embedded || 0)),
    warnings: preview.warnings, conflicts: findings.conflicts.slice(0, 100),
  };
  return { plan: { ...payload, planHash: await hashCanonicalJson(payload) }, expectedSources, nextSources };
}

// A cloud revision or conflict recovery copy contains source envelopes, not a
// Code 3 backup. Turn it into the same verified format as device exports without
// ever staging its contents in live browser storage.
export async function createVerifiedWorkspaceSnapshotBackup(sources, options = {}) {
  const values = new Map();
  for (const [sourceId, section] of Object.entries(sources || {})) {
    const source = WORKSPACE_LOCAL_SOURCES.find((entry) => entry.sourceId === sourceId);
    if (!source || !source.supportedSchemaVersions.includes(section?.schemaVersion)) fail("UNSUPPORTED_SOURCE", "The selected cloud version has an unsupported source.");
    if (source.storageKey) values.set(source.storageKey, canonicalStringify(projectSourceData(source, section.data)));
    else for (const [key, value] of Object.entries(section.data)) {
      if (!source.storageKeys.includes(key)) fail("UNSUPPORTED_KEY", "The selected cloud version has an unsupported preference.");
      values.set(key, typeof value === "string" ? value : canonicalStringify(value));
    }
  }
  if (!values.size) fail("EMPTY_SNAPSHOT", "The selected cloud version contains no saved sources.");
  const sourceRegistry = BACKUP_SOURCE_REGISTRY.map((source) => source.includedInPhase1AExport && !Object.hasOwn(sources, source.sourceId)
    ? { ...source, includedInPhase1AExport: false, exclusionReason: "This source was not present in the selected cloud version." }
    : source);
  const storage = { getItem: (key) => values.get(key) ?? null, key: (index) => [...values.keys()][index] ?? null, get length() { return values.size; } };
  const result = await createVerifiedBackup({ ...options, localStorage: storage, sourceRegistry, configuredSourceIds: ["supabase-owner-data"] });
  if (!result.verified) fail("SNAPSHOT_NOT_VERIFIED", "The selected cloud version could not be exported as a verified backup.");
  return result;
}
