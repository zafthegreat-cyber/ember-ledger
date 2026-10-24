import { BACKUP_SOURCE_REGISTRY, BACKUP_STORAGE_TYPES } from "./backupSourceRegistry.js";
import { readCurrentBackupSources } from "./backupFormat.js";
import { canonicalStringify, hashCanonicalJson, parseUntrustedBackupJson, parseUntrustedJsonValue } from "./canonicalJson.js";
import { sanitizeBackupData } from "./backupSecurity.js";
import { resolveSourceSchemaVersion, validateBackupCrossSourceRelationships, validateBackupSourceData } from "./backupValidation.js";
import { createWorkspacePayloadStore } from "../persistence/workspacePayloadStore.js";
import { projectPrivateImageReferences } from "../../services/privateStorageReferences.js";
import { projectSourceData, retainDeviceOnlySourceFields } from "./sourceProjection.js";

export const WORKSPACE_STORAGE_LOCK = "code3.workspace-storage.v1";
export const WORKSPACE_RECOVERY_KEY = "code3.workspace-recovery.v1";
export const WORKSPACE_CHECKPOINT_KEY = "code3.workspace-checkpoint.v1";
export const WORKSPACE_INLINE_JOURNAL_LIMIT = 128 * 1024;
// A journal holds both validated versions of a source. Its bounded parse budget
// must allow twice the source budget plus the transaction envelope.
const WORKSPACE_JOURNAL_PARSE_LIMITS = Object.freeze({ maxBytes: 24 * 1024 * 1024, maxStringLength: 10 * 1024 * 1024, maxTotalRecords: 250_000 });
export const WORKSPACE_LOCAL_SOURCES = Object.freeze(BACKUP_SOURCE_REGISTRY.filter((source) => source.includedInPhase1AExport && source.storageType === BACKUP_STORAGE_TYPES.LOCAL_STORAGE));

export class WorkspaceRecoveryError extends Error {
  constructor(code, message) { super(message); this.name = "WorkspaceRecoveryError"; this.code = code; }
}
function fail(code, message) { throw new WorkspaceRecoveryError(code, message); }
function equal(a, b) { return canonicalStringify(a) === canonicalStringify(b); }
function sourceFor(id) {
  const source = WORKSPACE_LOCAL_SOURCES.find((entry) => entry.sourceId === id);
  if (!source) fail("SOURCE_NOT_SUPPORTED", `The ${id} source is not available for device recovery.`);
  return source;
}
function read(storage, key) {
  const value = storage?.getItem(key);
  if (value !== null && typeof value !== "string") fail("STORAGE_UNAVAILABLE", "Device storage could not be read safely.");
  return value;
}
function write(storage, key, value) {
  try { if (value === null) storage.removeItem(key); else storage.setItem(key, value); } catch { /* Verify writes that may have succeeded before an adapter threw. */ }
  if (read(storage, key) !== value) fail("STORAGE_WRITE_FAILED", "Device storage could not retain the recovery write. Existing records are being preserved.");
}
function assertOwner(ownerId) {
  if (typeof ownerId !== "string" || !ownerId.trim()) fail("ACCOUNT_REQUIRED", "Sign in to the same account before recovering saved records.");
}
function assertClear(storage) {
  if (read(storage, WORKSPACE_RECOVERY_KEY) !== null) fail("RECOVERY_REQUIRED", "An interrupted save must be recovered before opening your records.");
}

function sourceIsAbsent(storage, source) {
  return source.storageKey ? read(storage, source.storageKey) === null : source.storageKeys.every((key) => read(storage, key) === null);
}

// These leases must be held while the app is mounted. Recovery is performed
// before mounting, or after unmounting all writers; a mutex alone is insufficient.
export async function acquireWorkspaceReadLease(locks = globalThis.navigator?.locks) {
  if (!locks?.request) fail("LOCK_UNAVAILABLE", "This browser cannot coordinate safe recovery. Use a browser with Web Locks support.");
  let release;
  let accepted;
  let rejected;
  const ready = new Promise((resolve, reject) => { accepted = resolve; rejected = reject; });
  const held = new Promise((resolve) => { release = resolve; });
  const request = locks.request(WORKSPACE_STORAGE_LOCK, { mode: "shared", ifAvailable: true }, (lock) => {
    if (!lock) { rejected(new WorkspaceRecoveryError("WORKSPACE_BUSY", "Recovery is running in another tab. Wait for it to finish before opening records.")); return; }
    accepted();
    return held;
  });
  void request.catch(rejected);
  await ready;
  return () => release();
}

export function withWorkspaceStorageLock(locks, operation) {
  if (!locks?.request) return Promise.reject(new WorkspaceRecoveryError("LOCK_UNAVAILABLE", "This browser cannot coordinate safe recovery. Use a browser with Web Locks support."));
  return locks.request(WORKSPACE_STORAGE_LOCK, { mode: "exclusive", ifAvailable: true }, (lock) => {
    if (!lock) fail("WORKSPACE_BUSY", "Close other Code 3 TCG tabs before saving recovered records. No records were changed.");
    return operation();
  });
}

export function captureRecoverySources(storage, { projectUrl } = {}) {
  const result = readCurrentBackupSources({ localStorage: storage, sourceRegistry: WORKSPACE_LOCAL_SOURCES, projectUrl });
  if (result.warnings.some((entry) => entry.message.startsWith("Current source could not be read"))) fail("SOURCE_UNREADABLE", "Some saved records cannot be read. They have not been cleared or replaced.");
  return Object.fromEntries(WORKSPACE_LOCAL_SOURCES.map((source) => [source.sourceId, {
    schemaVersion: resolveSourceSchemaVersion(source, result.sources[source.sourceId]), data: projectSourceData(source, result.sources[source.sourceId]),
  }]));
}

function validateSources(sources, { relationships = true, projectUrl } = {}) {
  if (!sources || typeof sources !== "object" || Array.isArray(sources)) fail("INVALID_SOURCES", "Recovery sources must be an object.");
  // Round-tripping also applies the bounded untrusted JSON/prototype checks.
  parseUntrustedBackupJson(canonicalStringify(sources));
  for (const [id, section] of Object.entries(sources)) {
    const source = sourceFor(id);
    if (!section || !source.supportedSchemaVersions.includes(section.schemaVersion)) fail("INVALID_SCHEMA", `${source.displayName} uses an unsupported version.`);
    if (!equal(sanitizeBackupData(section.data, { projectUrl }).data, section.data)) fail("PRIVATE_FIELDS", "Recovery cannot import authentication, credentials, or private provider payloads.");
    if (source.allowedFields && Object.keys(section.data).some((key) => !source.allowedFields.includes(key))) fail("UNSUPPORTED_FIELDS", "Recovery cannot import account permissions or unregistered fields.");
    if (source.storageKeys && Object.keys(section.data).some((key) => !source.storageKeys.includes(key))) fail("UNSUPPORTED_KEY", "Recovery cannot write an unregistered preference.");
    const validation = validateBackupSourceData(source, section.data);
    if (!validation.valid || validation.schemaVersion !== section.schemaVersion) fail("INVALID_SOURCE", `${source.displayName} did not pass validation.`);
  }
  if (relationships) {
    const cross = validateBackupCrossSourceRelationships(Object.entries(sources).map(([sourceId, section]) => ({ sourceId, ...section })));
    if (!cross.valid) fail("INVALID_RELATIONSHIPS", "Recovered record relationships did not pass validation.");
  }
}

function projectRecoverySources(sources) {
  if (!sources || typeof sources !== "object" || Array.isArray(sources)) return sources;
  return Object.fromEntries(Object.entries(sources).map(([id, section]) => [id,
    section && typeof section === "object" && !Array.isArray(section)
      ? { ...section, data: projectSourceData(sourceFor(id), section.data) }
      : section,
  ]));
}

function stableId(value) { return value && typeof value === "object" ? value.id ?? value.recordId ?? value.record_id ?? null : null; }

// Excluded local account/session metadata is never imported, exported, or
// journaled. Preserve it from the current device when replacing allowed data.
function retainPrivateFields(original, safeOriginal, next) {
  if (Array.isArray(next)) {
    if (!Array.isArray(original) || !Array.isArray(safeOriginal)) return next;
    return next.map((value) => {
      const id = stableId(value);
      const index = safeOriginal.findIndex((entry) => id !== null ? stableId(entry) === id : equal(entry, value));
      return index < 0 ? value : retainPrivateFields(original[index], safeOriginal[index], value);
    });
  }
  if (!next || typeof next !== "object" || !original || typeof original !== "object" || Array.isArray(original)) return next;
  const result = { ...next };
  for (const [key, value] of Object.entries(original)) {
    if (!Object.hasOwn(safeOriginal || {}, key)) result[key] = value;
    else if (Object.hasOwn(next, key)) result[key] = retainPrivateFields(value, safeOriginal[key], next[key]);
  }
  return result;
}

function rawForValue(storage, source, key, value, exists = true, projectUrl) {
  if (!exists) return null;
  if (source.storageKeys) return typeof value === "string" ? value : canonicalStringify(value);
  const raw = read(storage, key);
  if (raw === null) return canonicalStringify(value);
  const original = parseUntrustedJsonValue(raw);
  const projectedOriginal = projectPrivateImageReferences(original, projectUrl);
  const safeOriginal = sanitizeBackupData(projectedOriginal, { projectUrl }).data;
  const retained = retainDeviceOnlySourceFields(source, original, retainPrivateFields(original, safeOriginal, value));
  if (source.allowedFields) {
    for (const [field, fieldValue] of Object.entries(original)) {
      if (!source.allowedFields.includes(field)) retained[field] = fieldValue;
    }
  }
  if (sanitizeBackupData(projectPrivateImageReferences(retained, projectUrl), { projectUrl }).excludedPaths.length < sanitizeBackupData(projectedOriginal, { projectUrl }).excludedPaths.length) fail("PRIVATE_LOCAL_DATA", "This change would remove local-only private fields. Preserve those records before trying recovery again.");
  return canonicalStringify(retained);
}

function entriesFor(storage, before, after) {
  const entries = [];
  for (const [sourceId, section] of Object.entries(after)) {
    const source = sourceFor(sourceId);
    const prior = before[sourceId];
    if (!prior) fail("EXPECTED_SOURCE_REQUIRED", "A current-device comparison is required for every restored source.");
    if (source.storageKey) {
      if (!equal(prior.data, section.data)) entries.push({ sourceId, key: source.storageKey, beforeExists: read(storage, source.storageKey) !== null, beforeValue: prior.data, afterValue: section.data });
    } else {
      for (const key of Object.keys(section.data)) {
        if (!Object.hasOwn(prior.data, key) || !equal(prior.data[key], section.data[key])) entries.push({ sourceId, key, beforeExists: read(storage, key) !== null, beforeValue: prior.data[key] ?? null, afterValue: section.data[key] });
      }
    }
  }
  return entries;
}

function currentEntryValue(storage, entry, projectUrl) {
  const source = sourceFor(entry.sourceId);
  const current = readCurrentBackupSources({ localStorage: storage, sourceRegistry: [source], projectUrl });
  if (current.warnings.some((warning) => warning.message.startsWith("Current source could not be read"))) fail("SOURCE_UNREADABLE", "Recovery could not read saved records.");
  return source.storageKey ? projectSourceData(source, current.sources[entry.sourceId]) : current.sources[entry.sourceId][entry.key] ?? null;
}

async function sealed(payload) { return canonicalStringify({ ...payload, integrity: await hashCanonicalJson(payload) }); }
function isPayloadStoreFailure(error) { return error?.code?.startsWith("PAYLOAD_") || error?.code === "RECOVERY_PAYLOAD_UNAVAILABLE"; }
async function journalReferences({ prepared, committed, ownerId, transactionId, payloadStore, assertCurrent }) {
  const store = payloadStore || createWorkspacePayloadStore();
  const references = {};
  for (const [status, raw] of [["PREPARED", prepared], ["COMMITTED", committed]]) {
    const payloadHash = await hashCanonicalJson(raw);
    const payloadKey = `recovery:${ownerId}:${payloadHash}`;
    assertCurrent();
    await store.put(payloadKey, raw, { assertCurrent });
    // The store waits for transaction completion. Independently verify adapters
    // too: a success callback alone does not establish a durable before image.
    if (await store.get(payloadKey) !== raw) fail("RECOVERY_PAYLOAD_UNAVAILABLE", "The recovery safety copy could not be verified. Existing records were not changed.");
    assertCurrent();
    references[status] = canonicalStringify({ format: "code3-workspace-recovery-reference", version: 1, ownerId, transactionId, status, payloadKey, payloadHash });
  }
  return { prepared: references.PREPARED, committed: references.COMMITTED };
}

async function inspectJournal(raw, ownerId, payloadStore, assertCurrent, projectUrl) {
  let journal = parseUntrustedBackupJson(raw, WORKSPACE_JOURNAL_PARSE_LIMITS);
  let reference = null;
  if (journal.format === "code3-workspace-recovery-reference") {
    reference = journal;
    if (reference.version !== 1 || reference.ownerId !== ownerId || !["PREPARED", "COMMITTED"].includes(reference.status)
      || !/^[a-f0-9]{64}$/.test(reference.payloadHash || "") || !/^[a-f0-9]{64}$/.test(reference.transactionId || "")
      || reference.payloadKey !== `recovery:${ownerId}:${reference.payloadHash}`
      || Object.keys(reference).some((key) => !["format", "version", "ownerId", "transactionId", "status", "payloadKey", "payloadHash"].includes(key))) fail("INVALID_RECOVERY", "The recovery safety reference is damaged or belongs to another account.");
    let payloadRaw;
    try { payloadRaw = await (payloadStore || createWorkspacePayloadStore()).get(reference.payloadKey); }
    catch { fail("RECOVERY_PAYLOAD_UNAVAILABLE", "This browser could not open its recovery safety copy. Saved records and the recovery marker were kept."); }
    assertCurrent();
    if (typeof payloadRaw !== "string" || await hashCanonicalJson(payloadRaw) !== reference.payloadHash) fail("RECOVERY_PAYLOAD_UNAVAILABLE", "The recovery safety copy is missing or damaged. Saved records and the recovery marker were kept.");
    journal = parseUntrustedBackupJson(payloadRaw, WORKSPACE_JOURNAL_PARSE_LIMITS);
  }
  const { integrity, ...payload } = journal;
  if (journal.format !== "code3-workspace-recovery" || journal.version !== 1 || journal.ownerId !== ownerId || !["PREPARED", "COMMITTED"].includes(journal.status)
    || !Array.isArray(journal.entries) || !journal.entries.length || await hashCanonicalJson(payload) !== integrity
    || reference && (journal.transactionId !== reference.transactionId || journal.status !== reference.status)) fail("INVALID_RECOVERY", "The recovery checkpoint is damaged or belongs to another account. Saved records have not been changed.");
  const keys = new Set();
  for (const entry of journal.entries) {
    const source = sourceFor(entry.sourceId);
    if (keys.has(entry.key) || (source.storageKey ? entry.key !== source.storageKey : !source.storageKeys.includes(entry.key)) || typeof entry.beforeExists !== "boolean"
      || ![entry.beforeRawHash, entry.afterRawHash].every((value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value))) fail("INVALID_RECOVERY", "The recovery checkpoint contains an unsupported target.");
    keys.add(entry.key);
    if (source.storageKey) {
      // Verify the original checkpoint hash above before deriving the same
      // device-only projection used by current capture and conflict recovery.
      if (entry.beforeExists) entry.beforeValue = projectSourceData(source, entry.beforeValue);
      entry.afterValue = projectSourceData(source, entry.afterValue);
    }
    const wrap = (value) => ({ [entry.sourceId]: { schemaVersion: resolveSourceSchemaVersion(source, source.storageKey ? value : {}), data: source.storageKey ? value : { [entry.key]: value } } });
    if (entry.beforeExists) validateSources(wrap(entry.beforeValue), { relationships: false, projectUrl });
    validateSources(wrap(entry.afterValue), { relationships: false, projectUrl });
  }
  return journal;
}

function rollbackEntries(storage, entries, projectUrl) {
  // Check all targets before touching any: do not erase edits made outside the
  // transaction, including edits by an older app tab that lacks shared leases.
  for (const entry of entries) {
    const current = currentEntryValue(storage, entry, projectUrl);
    if (!equal(current, entry.beforeValue) && !equal(current, entry.afterValue)) fail("RECOVERY_CONFLICT", "Records changed after recovery started. Keep the checkpoint and review the newer records before retrying.");
  }
  for (const entry of entries.slice().reverse()) {
    const source = sourceFor(entry.sourceId);
    write(storage, entry.key, rawForValue(storage, source, entry.key, entry.beforeValue, entry.beforeExists, projectUrl));
  }
}

export function hasPendingWorkspaceRecovery(storage) { return read(storage, WORKSPACE_RECOVERY_KEY) !== null; }

export async function recoverWorkspaceSources({ storage, ownerId, locks = globalThis.navigator?.locks, assertCurrent = () => {}, payloadStore, projectUrl } = {}) {
  assertOwner(ownerId);
  return withWorkspaceStorageLock(locks, async () => {
    assertCurrent();
    const raw = read(storage, WORKSPACE_RECOVERY_KEY);
    if (raw === null) return { status: "NO_RECOVERY" };
    const journal = await inspectJournal(raw, ownerId, payloadStore, assertCurrent, projectUrl);
    const currentRaw = new Map(journal.entries.map((entry) => [entry.key, read(storage, entry.key)]));
    for (const entry of journal.entries) {
      const hash = await hashCanonicalJson(currentRaw.get(entry.key));
      if (hash !== entry.afterRawHash && (journal.status === "COMMITTED" || hash !== entry.beforeRawHash)) fail("RECOVERY_CONFLICT", "Records or device account settings changed after recovery started. The checkpoint was retained.");
    }
    if (read(storage, WORKSPACE_RECOVERY_KEY) !== raw) fail("RECOVERY_CONFLICT", "The checkpoint changed during recovery.");
    for (const [key, snapshot] of currentRaw) if (read(storage, key) !== snapshot) fail("RECOVERY_CONFLICT", "Records changed while recovery was being verified.");
    assertCurrent();
    if (journal.status === "PREPARED") rollbackEntries(storage, journal.entries, projectUrl);
    else for (const entry of journal.entries) {
      if (!equal(currentEntryValue(storage, entry, projectUrl), entry.afterValue)) fail("RECOVERY_CONFLICT", "Saved records changed after recovery completed. The checkpoint was retained.");
    }
    write(storage, WORKSPACE_RECOVERY_KEY, null);
    return { status: journal.status === "PREPARED" ? "ROLLED_BACK" : "RECOVERED_COMMIT", transactionId: journal.transactionId };
  });
}

export async function applyWorkspaceSources({ storage, expectedSources, nextSources, ownerId, locks = globalThis.navigator?.locks, assertCurrent = () => {}, payloadStore, projectUrl } = {}) {
  assertOwner(ownerId);
  expectedSources = projectRecoverySources(expectedSources);
  nextSources = projectRecoverySources(nextSources);
  validateSources(nextSources, { relationships: false, projectUrl });
  return withWorkspaceStorageLock(locks, async () => {
    assertCurrent();
    assertClear(storage);
    const before = captureRecoverySources(storage, { projectUrl });
    validateSources({ ...before, ...nextSources }, { projectUrl });
    for (const id of Object.keys(nextSources)) {
      const expected = expectedSources?.[id];
      if (expected ? !equal(before[id], expected) : !sourceIsAbsent(storage, sourceFor(id))) fail("STALE_SNAPSHOT", "Your saved records changed. Review the current version before recovering this backup.");
    }
    const entries = entriesFor(storage, before, nextSources);
    if (!entries.length) return { status: "UNCHANGED", changedSources: [] };
    const beforeRaw = new Map(entries.map((entry) => [entry.key, read(storage, entry.key)]));
    const afterRaw = new Map(entries.map((entry) => [entry.key, rawForValue(storage, sourceFor(entry.sourceId), entry.key, entry.afterValue, true, projectUrl)]));
    await Promise.all(entries.map(async (entry) => {
      entry.beforeRawHash = await hashCanonicalJson(beforeRaw.get(entry.key));
      entry.afterRawHash = await hashCanonicalJson(afterRaw.get(entry.key));
    }));
    const transactionId = await hashCanonicalJson({ ownerId, before: expectedSources, after: nextSources, createdAt: new Date().toISOString() });
    const payload = { format: "code3-workspace-recovery", version: 1, ownerId, transactionId, createdAt: new Date().toISOString(), status: "PREPARED", entries };
    const prepared = await sealed(payload);
    const committed = await sealed({ ...payload, status: "COMMITTED" });
    // Never persist a safety image that startup cannot read with its same limits.
    parseUntrustedBackupJson(prepared, WORKSPACE_JOURNAL_PARSE_LIMITS);
    parseUntrustedBackupJson(committed, WORKSPACE_JOURNAL_PARSE_LIMITS);
    let journal = { prepared, committed };
    const priorCheckpoint = read(storage, WORKSPACE_CHECKPOINT_KEY);
    let payloadError;
    if (prepared.length > WORKSPACE_INLINE_JOURNAL_LIMIT) {
      try { journal = await journalReferences({ prepared, committed, ownerId, transactionId, payloadStore, assertCurrent }); }
      catch (error) { if (!isPayloadStoreFailure(error)) throw error; payloadError = error; assertCurrent(); }
    }
    const assertUnchanged = () => {
      assertClear(storage);
      if (read(storage, WORKSPACE_CHECKPOINT_KEY) !== priorCheckpoint) fail("STALE_SNAPSHOT", "The recovery safety copy changed while this save was being prepared.");
      for (const [key, raw] of beforeRaw) if (read(storage, key) !== raw) fail("STALE_SNAPSHOT", "Records changed while recovery was being prepared.");
      assertCurrent();
    };
    // Finish all asynchronous work before this compare/write window. Checkpoint
    // capacity is tested before any business record changes.
    assertUnchanged();
    try {
      write(storage, WORKSPACE_CHECKPOINT_KEY, journal.prepared);
      write(storage, WORKSPACE_RECOVERY_KEY, journal.prepared);
    } catch (error) {
      // No business write has started. Remove only this attempt's provisional
      // checkpoint by restoring its exact prior bytes before trying IDB.
      if (read(storage, WORKSPACE_RECOVERY_KEY) !== null) fail("RECOVERY_REQUIRED", "Recovery stopped with a safety marker. Reopen recovery before using saved records.");
      if (read(storage, WORKSPACE_CHECKPOINT_KEY) === journal.prepared) write(storage, WORKSPACE_CHECKPOINT_KEY, priorCheckpoint);
      if (journal.prepared !== prepared || payloadError) throw error;
      try { journal = await journalReferences({ prepared, committed, ownerId, transactionId, payloadStore, assertCurrent }); }
      catch (payloadFailure) { if (!isPayloadStoreFailure(payloadFailure)) throw payloadFailure; assertCurrent(); throw error; }
      assertUnchanged();
      write(storage, WORKSPACE_CHECKPOINT_KEY, journal.prepared);
      write(storage, WORKSPACE_RECOVERY_KEY, journal.prepared);
    }
    try {
      for (const [key, raw] of beforeRaw) if (read(storage, key) !== raw) fail("STALE_SNAPSHOT", "Records changed before recovery could be saved.");
      for (const [key, raw] of afterRaw) write(storage, key, raw);
      write(storage, WORKSPACE_RECOVERY_KEY, journal.committed);
    } catch (error) {
      try { rollbackEntries(storage, entries, projectUrl); write(storage, WORKSPACE_RECOVERY_KEY, null); } catch { fail("RECOVERY_REQUIRED", "Recovery stopped safely with a checkpoint. Reopen recovery before using saved records."); }
      throw error;
    }
    // If cleanup fails the committed journal lets startup verify, not undo, the save.
    write(storage, WORKSPACE_RECOVERY_KEY, null);
    return { status: "APPLIED", transactionId, changedSources: [...new Set(entries.map((entry) => entry.sourceId))], checkpointKey: WORKSPACE_CHECKPOINT_KEY };
  });
}
