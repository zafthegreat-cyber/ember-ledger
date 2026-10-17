import { ACCOUNT_OPS_STORAGE_KEY } from "./constants.js";

export const ACCOUNT_OPS_RESTORE_JOURNAL_KEY = "code3.account-ops.restore-journal.v1";
export const ACCOUNT_OPS_RESTORE_LOCK = "code3.account-ops.restore.v1";

export class AccountOpsRecoveryError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AccountOpsRecoveryError";
    this.code = code;
  }
}

// Never parse, clear, repair, or expose the journal here. Both prepared and
// committed journals (including malformed values) need the recovery executor.
export function assertAccountOpsRecoveryClear(storage) {
  let raw;
  try {
    if (typeof storage?.getItem !== "function") throw new Error("Storage unavailable");
    raw = storage.getItem(ACCOUNT_OPS_RESTORE_JOURNAL_KEY);
  } catch {
    throw new AccountOpsRecoveryError("RECOVERY_STATUS_UNAVAILABLE", "Account Ops recovery status could not be checked. Saved records have not been changed.");
  }
  if (raw !== null && raw !== undefined) {
    throw new AccountOpsRecoveryError("RECOVERY_REQUIRED", "Account Ops cannot open safely while recovery is unfinished. Your saved records have not been cleared.");
  }
}

export function readAccountOpsRecoveryGuardedRaw(storage) {
  assertAccountOpsRecoveryClear(storage);
  try {
    return storage.getItem(ACCOUNT_OPS_STORAGE_KEY);
  } finally {
    // Also check after a failed target read: a journal may have appeared while
    // reading, and the repository must not return its ordinary cached fallback.
    // This is a guard, not cross-tab writer coordination.
    assertAccountOpsRecoveryClear(storage);
  }
}
