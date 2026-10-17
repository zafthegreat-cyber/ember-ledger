import { ACCOUNT_OPS_RESTORE_LOCK } from "./recoveryState.js";

const queues = new WeakMap();

export class AccountOpsCoordinationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AccountOpsCoordinationError";
    this.code = code;
  }
}

export function isBrowserAccountOpsStorage(storage) {
  try { return typeof window !== "undefined" && storage === window.localStorage; }
  catch { return true; }
}

// A Web Lock is shared by independent tabs on this origin. The in-process queue
// is only for injected, non-browser stores (tests/host adapters), never a browser
// substitute. Restore and every participating writer use this same lock name.
export function accountOpsExclusive(storage, options = {}) {
  const browserStorage = isBrowserAccountOpsStorage(storage);
  const locks = options.locks ?? (browserStorage ? globalThis.navigator?.locks : null);
  return (name, operation) => {
    if (name !== ACCOUNT_OPS_RESTORE_LOCK) throw new AccountOpsCoordinationError("LOCK_SCOPE_INVALID", "The Account Ops operation lock is required.");
    if (locks?.request) return locks.request(name, { mode: "exclusive" }, operation);
    if (browserStorage || options.requireCrossTabLock) {
      return Promise.reject(new AccountOpsCoordinationError("LOCK_UNAVAILABLE", "This browser cannot safely coordinate Account Ops saves. Use a browser with Web Locks support."));
    }
    if (!storage || typeof storage !== "object") return Promise.reject(new AccountOpsCoordinationError("STORAGE_UNAVAILABLE", "Account Ops storage is unavailable."));
    const previous = queues.get(storage) || Promise.resolve();
    const next = previous.catch(() => {}).then(operation);
    const settled = next.then(() => {}, () => {});
    queues.set(storage, settled);
    void settled.then(() => { if (queues.get(storage) === settled) queues.delete(storage); });
    return next;
  };
}
