// Lightweight recovery state (audit 2026-11-14).
//
// The app shell must know at startup whether an interrupted write needs
// recovery, and hold a shared read lease while records are open. The recovery
// code itself (validation, backup format, inventory cost rules) is large, so
// only these small pieces live here; workspaceRecovery.js imports and
// re-exports them so there is still one definition of each.
export const WORKSPACE_RECOVERY_KEY = "code3.workspace-recovery.v1";
export const WORKSPACE_STORAGE_LOCK = "code3.workspace-storage.v1";
export const WORKSPACE_CHECKPOINT_KEY = "code3.workspace-checkpoint.v1";

export class WorkspaceRecoveryError extends Error {
  constructor(code, message) { super(message); this.name = "WorkspaceRecoveryError"; this.code = code; }
}

export function hasPendingWorkspaceRecovery(storage) {
  const value = storage?.getItem(WORKSPACE_RECOVERY_KEY);
  if (value !== null && typeof value !== "string") throw new WorkspaceRecoveryError("STORAGE_UNAVAILABLE", "Device storage could not be read safely.");
  return value !== null;
}

export async function acquireWorkspaceReadLease(locks = globalThis.navigator?.locks) {
  if (!locks?.request) throw new WorkspaceRecoveryError("LOCK_UNAVAILABLE", "This browser cannot coordinate safe recovery. Use a browser with Web Locks support.");
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
    if (!lock) throw new WorkspaceRecoveryError("WORKSPACE_BUSY", "Close other Code 3 TCG tabs before saving recovered records. No records were changed.");
    return operation();
  });
}
