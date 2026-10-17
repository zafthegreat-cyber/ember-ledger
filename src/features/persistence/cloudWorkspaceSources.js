import { BACKUP_SOURCE_REGISTRY, BACKUP_STORAGE_TYPES } from "../backup/backupSourceRegistry.js";
import { canonicalStringify, hashCanonicalJson, parseUntrustedJsonValue } from "../backup/canonicalJson.js";
import { findProhibitedData } from "../backup/backupSecurity.js";
import { resolveSourceSchemaVersion, validateBackupSourceData, validateBackupCrossSourceRelationships } from "../backup/backupValidation.js";
import { readAccountOpsRecoveryGuardedRaw } from "../accountOps/recoveryState.js";

export const WORKSPACE_CLOUD_FORMAT = "code3-workspace-v1";
export const WORKSPACE_MAX_BYTES = 8 * 1024 * 1024;
export const WORKSPACE_SYNC_SOURCES = Object.freeze(BACKUP_SOURCE_REGISTRY.filter((source) =>
  source.storageType === BACKUP_STORAGE_TYPES.LOCAL_STORAGE && source.includedInPhase1AExport));
export const WORKSPACE_SYNC_KEYS = Object.freeze(WORKSPACE_SYNC_SOURCES.flatMap((source) => source.storageKeys || [source.storageKey]));

export class WorkspaceSyncError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "WorkspaceSyncError";
    this.code = code;
    this.details = details;
  }
}

export function workspaceFail(code, message, details) { throw new WorkspaceSyncError(code, message, details); }
export function cloneWorkspaceJson(value) { return JSON.parse(canonicalStringify(value)); }

function readJson(raw, allowText = false) {
  try { return parseUntrustedJsonValue(raw, { maxBytes: WORKSPACE_MAX_BYTES }); }
  catch (error) {
    if (allowText && error.code === "MALFORMED_JSON") return raw;
    throw error;
  }
}

function projectSource(source, value) {
  if (!source.allowedFields) return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) workspaceFail("INVALID_LOCAL_DATA", `${source.displayName} could not be read safely.`);
  return Object.fromEntries(source.allowedFields.filter((key) => Object.hasOwn(value, key)).map((key) => [key, value[key]]));
}

/** The original storage bytes stay in place. No sanitizing rewrite or canonical remapping occurs. */
export function captureWorkspaceSources(storage) {
  const sources = {};
  for (const source of WORKSPACE_SYNC_SOURCES) {
    let data;
    try {
      if (source.storageKeys) {
        data = {};
        for (const key of source.storageKeys) {
          const raw = storage.getItem(key);
          if (raw !== null) data[key] = readJson(raw, true);
        }
        if (!Object.keys(data).length) continue;
      } else {
        const raw = source.sourceId === "account-ops" ? readAccountOpsRecoveryGuardedRaw(storage) : storage.getItem(source.storageKey);
        if (raw === null) continue;
        data = projectSource(source, readJson(raw));
      }
      sources[source.sourceId] = { schemaVersion: resolveSourceSchemaVersion(source, data), data };
    } catch (error) {
      workspaceFail("INVALID_LOCAL_DATA", `${source.displayName} needs review before cloud saving. Its original data is unchanged.`, { sourceId: source.sourceId, reason: error.code || "UNREADABLE" });
    }
  }
  return validateWorkspaceSources(sources);
}

export function validateWorkspaceSources(input) {
  const sources = parseUntrustedJsonValue(canonicalStringify(input), { maxBytes: WORKSPACE_MAX_BYTES });
  if (!sources || Array.isArray(sources) || typeof sources !== "object") workspaceFail("INVALID_WORKSPACE", "Cloud workspace data must contain registered sources.");
  const sections = [];
  for (const [sourceId, entry] of Object.entries(sources)) {
    const source = WORKSPACE_SYNC_SOURCES.find((candidate) => candidate.sourceId === sourceId);
    if (!source) workspaceFail("UNSUPPORTED_SOURCE", "This cloud workspace requires a newer app version.", { sourceId });
    if (!entry || Array.isArray(entry) || Object.keys(entry).some((key) => !["schemaVersion", "data"].includes(key))
      || !Number.isInteger(entry.schemaVersion) || !Object.hasOwn(entry, "data")) workspaceFail("INVALID_SOURCE", "A cloud source is invalid.", { sourceId });
    if (source.allowedFields && Object.keys(entry.data || {}).some((key) => !source.allowedFields.includes(key))) workspaceFail("PROHIBITED_SOURCE_FIELD", "Security and session fields cannot enter cloud workspace data.", { sourceId });
    if (source.storageKeys && Object.keys(entry.data || {}).some((key) => !source.storageKeys.includes(key))) workspaceFail("PROHIBITED_STORAGE_KEY", "Cloud preferences contain an unregistered storage key.", { sourceId });
    if (findProhibitedData(entry.data).length) workspaceFail("SECURITY_REVIEW_REQUIRED", `${source.displayName} contains security-sensitive fields. Its original data is preserved locally; review it before syncing.`, { sourceId });
    const validation = validateBackupSourceData(source, entry.data);
    if (!validation.valid || validation.schemaVersion !== entry.schemaVersion) workspaceFail("INVALID_SOURCE", `${source.displayName} failed validation. No saved records were replaced.`, { sourceId });
    sections.push({ sourceId, schemaVersion: entry.schemaVersion, data: entry.data });
  }
  const relationships = validateBackupCrossSourceRelationships(sections);
  if (!relationships.valid) workspaceFail("INVALID_RELATIONSHIPS", "Related records require review before cloud saving. No saved records were replaced.");
  return sources;
}

export async function workspaceSourceHashes(sources) {
  return Object.fromEntries(await Promise.all(Object.entries(sources).map(async ([sourceId, value]) => [sourceId, await hashCanonicalJson(value)])));
}

/** Merge independent source changes. Same-source concurrent edits always require review. */
export async function reconcileWorkspaceSources({ baselineHashes = {}, localSources, remoteSources }) {
  const local = validateWorkspaceSources(localSources);
  const remote = validateWorkspaceSources(remoteSources);
  const localHashes = await workspaceSourceHashes(local);
  const remoteHashes = await workspaceSourceHashes(remote);
  const merged = {};
  const conflicts = [];
  const changedLocal = [];
  const changedRemote = [];
  for (const sourceId of new Set([...Object.keys(baselineHashes), ...Object.keys(local), ...Object.keys(remote)])) {
    const base = baselineHashes[sourceId] ?? null;
    const ours = localHashes[sourceId] ?? null;
    const theirs = remoteHashes[sourceId] ?? null;
    let selected;
    if (ours === theirs) selected = local[sourceId];
    else if (ours === base) { selected = remote[sourceId]; changedLocal.push(sourceId); }
    else if (theirs === base) { selected = local[sourceId]; changedRemote.push(sourceId); }
    else { conflicts.push(sourceId); continue; }
    // Removing an entire source is a recovery decision, not an automatic sync operation.
    if (!selected && base !== null) { conflicts.push(sourceId); continue; }
    if (selected) merged[sourceId] = selected;
  }
  if (!conflicts.length) validateWorkspaceSources(merged);
  return { sources: merged, conflicts, changedLocal, changedRemote, localHashes, remoteHashes };
}
