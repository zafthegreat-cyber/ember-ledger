import { ACCOUNT_OPS_COLLECTIONS, ACCOUNT_OPS_STORAGE_KEY } from "../accountOps/constants.js";
import { ACCOUNT_OPS_PROFILE_GROUP_PRESETS, normalizeAccountOpsState } from "../accountOps/repository.js";
import { ACCOUNT_OPS_RESTORE_JOURNAL_KEY, ACCOUNT_OPS_RESTORE_LOCK } from "../accountOps/recoveryState.js";
import { canonicalStringify, hashCanonicalJson, parseUntrustedBackupJson } from "./canonicalJson.js";
import { previewBackupRestore, RESTORE_PREVIEW_RESULTS } from "./restorePreview.js";

// Deliberately not wired to the app. A host must supply current owner authorization,
// an exclusive lock shared by ALL Account Ops readers/writers, and startup recovery
// before enabling this first, single-source restore slice. No ambient storage access.
export { ACCOUNT_OPS_RESTORE_JOURNAL_KEY, ACCOUNT_OPS_RESTORE_LOCK };
export const ACCOUNT_OPS_RESTORE_MAX_STATE_BYTES = 256 * 1024;
export const ACCOUNT_OPS_RECEIPT_PREFIX = "code3.account-ops.restore-receipt.v1:";
const SOURCE = "account-ops";
const CLOCK = () => "1970-01-01T00:00:00.000Z";
const SHA256 = /^[a-f0-9]{64}$/;
const encoder = new TextEncoder();
const sectionFields = new Set(["sourceId", "schemaVersion", "recordCount", "data", "warnings", "sha256"]);
const journalFields = new Set(["format", "version", "sourceId", "targetKey", "status", "planHash", "beforeRaw", "afterRaw", "beforeHash", "afterHash", "journalHash"]);

export class AccountOpsRestoreError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "AccountOpsRestoreError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details) { throw new AccountOpsRestoreError(code, message, details); }
function read(storage, key) {
  let value;
  try { value = storage.getItem(key); } catch { fail("STORAGE_READ_FAILED", "Restore storage could not be read."); }
  if (value !== null && typeof value !== "string") fail("INVALID_STORAGE", "Restore requires synchronous string storage.");
  return value;
}
function storageRequired(storage, writable = false) {
  const methods = writable ? ["getItem", "setItem", "removeItem"] : ["getItem"];
  if (!storage || methods.some((method) => typeof storage[method] !== "function")) {
    fail("STORAGE_REQUIRED", "An explicit storage adapter is required.");
  }
}
function noPendingJournal(storage) {
  if (read(storage, ACCOUNT_OPS_RESTORE_JOURNAL_KEY) !== null) {
    fail("RECOVERY_REQUIRED", "A pending Account Ops restore must be recovered first.");
  }
}
function parseState(raw) {
  if (typeof raw !== "string" || encoder.encode(raw).byteLength > ACCOUNT_OPS_RESTORE_MAX_STATE_BYTES) {
    fail("STATE_LIMIT", "This restore slice supports Account Ops snapshots up to 256 KiB.");
  }
  try {
    const value = parseUntrustedBackupJson(raw, { maxBytes: ACCOUNT_OPS_RESTORE_MAX_STATE_BYTES });
    // Do not invent a timestamp during recovery or permit a malformed target to
    // become an empty state through the repository's forgiving load fallback.
    if (typeof value.updatedAt !== "string" || !Number.isFinite(Date.parse(value.updatedAt))) throw new Error("timestamp");
    return normalizeAccountOpsState(value, { now: CLOCK });
  } catch {
    fail("INVALID_STATE", "The Account Ops snapshot is invalid; no records were replaced.");
  }
}
function assertEmptyTarget(raw) {
  if (raw === null) return;
  const state = parseState(raw);
  const normalizedPresets = normalizeAccountOpsState({
    schemaVersion: 1, updatedAt: CLOCK(),
    ...Object.fromEntries(ACCOUNT_OPS_COLLECTIONS.map((collection) => [collection, collection === "profileGroups" ? ACCOUNT_OPS_PROFILE_GROUP_PRESETS : []])),
  }, { now: CLOCK }).profileGroups;
  const presets = new Map(normalizedPresets.map((record) => [record.id, canonicalStringify(record)]));
  if (ACCOUNT_OPS_COLLECTIONS.some((collection) => collection !== "profileGroups" && state[collection].length)
      || state.profileGroups.some((record) => presets.get(record.id) !== canonicalStringify(record))) {
    fail("TARGET_NOT_EMPTY", "This first restore slice cannot replace or merge existing Account Ops records.");
  }
}
async function inspectIncoming(raw) {
  const backup = parseUntrustedBackupJson(raw);
  if (!Array.isArray(backup.sections) || backup.sections.length !== 1 || backup.sections[0]?.sourceId !== SOURCE) {
    fail("UNSUPPORTED_SOURCES", "Only a single-source Account Ops backup is supported by this restore slice.");
  }
  const section = backup.sections[0];
  if (section.schemaVersion !== 1 || !Array.isArray(section.warnings)
      || Object.keys(section).some((key) => !sectionFields.has(key))) {
    fail("UNSUPPORTED_SECTION", "The Account Ops section has an unsupported schema or field.");
  }
  if (!Array.isArray(backup.manifest?.includedSources) || backup.manifest.includedSources.length !== 1
      || backup.manifest.includedSources[0]?.sourceId !== SOURCE) {
    fail("INVALID_SOURCE_INDEX", "The restore source index must contain Account Ops exactly once.");
  }
  const preview = await previewBackupRestore(raw, { startedAt: CLOCK() });
  if (preview.result !== RESTORE_PREVIEW_RESULTS.READY_FOR_FUTURE_RESTORE || section.warnings?.length) {
    fail("BACKUP_NOT_READY", "The backup must pass integrity, security, schema, and relationship checks without warnings.", { result: preview.result });
  }
  const normalized = parseState(canonicalStringify(section.data));
  const afterRaw = canonicalStringify(normalized);
  parseState(afterRaw);
  return { afterRaw, recordCounts: Object.fromEntries(ACCOUNT_OPS_COLLECTIONS.map((key) => [key, normalized[key].length])) };
}

async function buildPlan(raw, storage) {
  storageRequired(storage);
  noPendingJournal(storage);
  const beforeRaw = read(storage, ACCOUNT_OPS_STORAGE_KEY);
  assertEmptyTarget(beforeRaw);
  const { afterRaw, recordCounts } = await inspectIncoming(raw);
  const payload = {
    format: "code3.account-ops.restore-plan", version: 1, sourceId: SOURCE, targetKey: ACCOUNT_OPS_STORAGE_KEY,
    strategy: "EMPTY_TARGET_ONLY", backupHash: await hashCanonicalJson(raw),
    beforeHash: await hashCanonicalJson(beforeRaw), afterHash: await hashCanonicalJson(afterRaw),
    targetWasAbsent: beforeRaw === null, recordCounts,
  };
  const plan = { ...payload, planHash: await hashCanonicalJson(payload) };
  noPendingJournal(storage);
  if (read(storage, ACCOUNT_OPS_STORAGE_KEY) !== beforeRaw) fail("STALE_TARGET", "Account Ops changed while the restore was being planned.");
  return { plan, beforeRaw, afterRaw };
}

// Planning reads only. The plan carries hashes/counts, never backup record contents.
export async function planAccountOpsRestore(raw, { storage } = {}) {
  const { plan } = await buildPlan(raw, storage);
  return Object.freeze({ ...plan, recordCounts: Object.freeze(plan.recordCounts) });
}

function writeVerified(storage, key, value) {
  // Some adapters throw after a durable write. Readback, not the thrown result,
  // determines whether the requested exact value reached the store.
  try {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value);
  } catch { /* Verify the actual state below. */ }
  if (read(storage, key) !== value) fail("STORAGE_WRITE_FAILED", "Restore storage did not retain the expected value.");
}
async function sealJournal(payload) {
  return canonicalStringify({ ...payload, journalHash: await hashCanonicalJson(payload) });
}
async function inspectJournal(raw) {
  try {
    const value = parseUntrustedBackupJson(raw, { maxBytes: 1024 * 1024 });
    if (Object.keys(value).some((key) => !journalFields.has(key)) || Object.keys(value).length !== journalFields.size
        || value.format !== "code3.account-ops.restore-journal" || value.version !== 1
        || value.sourceId !== SOURCE || value.targetKey !== ACCOUNT_OPS_STORAGE_KEY
        || !["PREPARED", "COMMITTED"].includes(value.status)
        || ![value.planHash, value.beforeHash, value.afterHash, value.journalHash].every((hash) => typeof hash === "string" && SHA256.test(hash))) throw new Error("shape");
    const { journalHash, ...payload } = value;
    if (await hashCanonicalJson(payload) !== journalHash
        || await hashCanonicalJson(value.beforeRaw) !== value.beforeHash
        || await hashCanonicalJson(value.afterRaw) !== value.afterHash) throw new Error("hash");
    assertEmptyTarget(value.beforeRaw);
    parseState(value.afterRaw);
    return value;
  } catch {
    fail("INVALID_JOURNAL", "The pending restore journal is invalid; manual recovery is required.");
  }
}

/**
 * The injected exclusive lock must cover every host Account Ops writer. An
 * isolated JS mutex does not coordinate browser tabs or the existing repository.
 * Authorization must recheck the owner session/reauth in the host; a plan hash is
 * an integrity binding, not proof of identity or authenticity of a backup author.
 */
export function createAccountOpsRestoreExecutor({ storage, authorize, runExclusive } = {}) {
  storageRequired(storage, true);
  if (typeof authorize !== "function" || typeof runExclusive !== "function") {
    fail("HOST_GATES_REQUIRED", "Restore requires explicit authorization and a host exclusive lock.");
  }
  let uncertain = false;
  function persistCompletion(journal) {
    const key = `${ACCOUNT_OPS_RECEIPT_PREFIX}${journal.planHash}`;
    const state = parseState(journal.afterRaw);
    const payload = {
      format: "code3.account-ops.restore-receipt", version: 1, operationId: journal.planHash,
      sourceId: SOURCE, result: "APPLIED", beforeHash: journal.beforeHash, afterHash: journal.afterHash,
      recordCounts: Object.fromEntries(ACCOUNT_OPS_COLLECTIONS.map((name) => [name, state[name].length])),
    };
    const existing = read(storage, key);
    if (existing !== null) {
      let parsed;
      try { parsed = JSON.parse(existing); } catch { fail("RECEIPT_CONFLICT", "The recovery receipt is unreadable. Keep the journal for review."); }
      const { completedAt, ...prior } = parsed || {};
      if (!Number.isFinite(Date.parse(completedAt)) || canonicalStringify(prior) !== canonicalStringify(payload)) {
        fail("RECEIPT_CONFLICT", "The recovery receipt does not match this operation. Keep the journal for review.");
      }
      return key;
    }
    writeVerified(storage, key, canonicalStringify({ ...payload, completedAt: new Date().toISOString() }));
    return key;
  }
  async function authorized(operation, planHash) {
    if (await authorize({ operation, sourceId: SOURCE, targetKey: ACCOUNT_OPS_STORAGE_KEY, planHash }) !== true) {
      fail("NOT_AUTHORIZED", "Current owner authorization is required for restore.");
    }
  }
  async function recoverInsideLock({ authorizeRecovery = true, absentJournalProof = null } = {}) {
    const raw = read(storage, ACCOUNT_OPS_RESTORE_JOURNAL_KEY);
    if (raw === null) {
      if (uncertain) {
        const current = read(storage, ACCOUNT_OPS_STORAGE_KEY);
        if (!absentJournalProof || (current !== absentJournalProof.beforeRaw
            && !(absentJournalProof.commitVerified && current === absentJournalProof.afterRaw))) {
          fail("RECOVERY_REQUIRED", "The restore journal is missing and this operation cannot prove the current snapshot. Manual recovery is required.");
        }
      }
      uncertain = false;
      return { status: "NO_RECOVERY", sourceId: SOURCE };
    }
    const journal = await inspectJournal(raw);
    if (authorizeRecovery) await authorized("RECOVER", journal.planHash);
    // Abort on unrelated writes instead of clobbering newer user records.
    if (read(storage, ACCOUNT_OPS_RESTORE_JOURNAL_KEY) !== raw) fail("RECOVERY_CONFLICT", "The restore journal changed during recovery.");
    const current = read(storage, ACCOUNT_OPS_STORAGE_KEY);
    if (journal.status === "COMMITTED") {
      if (current !== journal.afterRaw) fail("RECOVERY_CONFLICT", "Committed Account Ops records changed; recovery cannot overwrite them.");
      persistCompletion(journal);
    } else {
      if (current !== journal.beforeRaw && current !== journal.afterRaw) fail("RECOVERY_CONFLICT", "Account Ops changed outside the pending restore; recovery cannot overwrite it.");
      writeVerified(storage, ACCOUNT_OPS_STORAGE_KEY, journal.beforeRaw);
    }
    writeVerified(storage, ACCOUNT_OPS_RESTORE_JOURNAL_KEY, null);
    uncertain = false;
    return { status: journal.status === "COMMITTED" ? "RECOVERED_COMMIT" : "RECOVERED_ROLLBACK", sourceId: SOURCE, planHash: journal.planHash };
  }
  return Object.freeze({
    async pendingPlan() {
      const raw = read(storage, ACCOUNT_OPS_RESTORE_JOURNAL_KEY);
      if (raw === null) return null;
      const journal = await inspectJournal(raw);
      return { planHash: journal.planHash, sourceId: SOURCE, operation: "RECOVER", status: journal.status };
    },
    async plan(raw) {
      if (uncertain) fail("RECOVERY_REQUIRED", "Restore storage must be recovered before another plan.");
      return planAccountOpsRestore(raw, { storage });
    },
    read() {
      if (uncertain) fail("RECOVERY_REQUIRED", "Restore storage must be recovered before it can be read.");
      noPendingJournal(storage);
      const raw = read(storage, ACCOUNT_OPS_STORAGE_KEY);
      noPendingJournal(storage);
      return raw === null ? null : parseState(raw);
    },
    recover: () => runExclusive(ACCOUNT_OPS_RESTORE_LOCK, () => recoverInsideLock()),
    apply: ({ raw, plan, confirmedPlanHash } = {}) => runExclusive(ACCOUNT_OPS_RESTORE_LOCK, async () => {
      if (uncertain) fail("RECOVERY_REQUIRED", "Restore storage must be recovered before another restore.");
      const candidate = await buildPlan(raw, storage);
      if (!plan || canonicalStringify(candidate.plan) !== canonicalStringify(plan)) {
        fail("STALE_PLAN", "The approved restore plan no longer matches the backup or current target.");
      }
      if (confirmedPlanHash !== candidate.plan.planHash) fail("CONFIRMATION_REQUIRED", "Confirm the exact current restore plan before applying it.");
      await authorized("APPLY", candidate.plan.planHash);
      noPendingJournal(storage);
      if (read(storage, ACCOUNT_OPS_STORAGE_KEY) !== candidate.beforeRaw) fail("STALE_TARGET", "Account Ops changed after restore approval.");
      const journal = {
        format: "code3.account-ops.restore-journal", version: 1, sourceId: SOURCE, targetKey: ACCOUNT_OPS_STORAGE_KEY,
        status: "PREPARED", planHash: candidate.plan.planHash,
        beforeRaw: candidate.beforeRaw, afterRaw: candidate.afterRaw,
        beforeHash: candidate.plan.beforeHash, afterHash: candidate.plan.afterHash,
      };
      const preparedRaw = await sealJournal(journal);
      const committedRaw = await sealJournal({ ...journal, status: "COMMITTED" });
      await authorized("APPLY", candidate.plan.planHash);
      noPendingJournal(storage);
      if (read(storage, ACCOUNT_OPS_STORAGE_KEY) !== candidate.beforeRaw) fail("STALE_TARGET", "Account Ops changed before the restore write.");
      let commitVerified = false;
      try {
        writeVerified(storage, ACCOUNT_OPS_RESTORE_JOURNAL_KEY, preparedRaw);
        writeVerified(storage, ACCOUNT_OPS_STORAGE_KEY, candidate.afterRaw);
        writeVerified(storage, ACCOUNT_OPS_RESTORE_JOURNAL_KEY, committedRaw);
        commitVerified = true;
        persistCompletion(journal);
        writeVerified(storage, ACCOUNT_OPS_RESTORE_JOURNAL_KEY, null);
        return { status: "APPLIED", sourceId: SOURCE, planHash: candidate.plan.planHash };
      } catch (error) {
        uncertain = true;
        let recovery;
        try {
          // This remains inside the authorized operation and the same host lock.
          recovery = await recoverInsideLock({ authorizeRecovery: false, absentJournalProof: {
            beforeRaw: candidate.beforeRaw, afterRaw: candidate.afterRaw, commitVerified,
          } });
          if (recovery.status === "RECOVERED_COMMIT" || (commitVerified && recovery.status === "NO_RECOVERY"
              && read(storage, ACCOUNT_OPS_STORAGE_KEY) === candidate.afterRaw)) {
            return { status: "APPLIED", sourceId: SOURCE, planHash: candidate.plan.planHash };
          }
          if (recovery.status === "NO_RECOVERY" && read(storage, ACCOUNT_OPS_STORAGE_KEY) !== candidate.beforeRaw) {
            fail("RECOVERY_CONFLICT", "Restore storage changed without a recoverable journal.");
          }
        } catch (recoveryError) {
          uncertain = true;
          fail("RECOVERY_REQUIRED", "Restore could not be finalized or rolled back. Keep the journal and recover before reading or writing Account Ops.", {
            cause: error?.code || "STORAGE_FAILURE", recoveryCause: recoveryError?.code || "STORAGE_FAILURE",
          });
        }
        fail("RESTORE_ROLLED_BACK", "The restore failed. The exact previous Account Ops snapshot is retained.", { cause: error?.code || "STORAGE_FAILURE" });
      }
    }),
  });
}
