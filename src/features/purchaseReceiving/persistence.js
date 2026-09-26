import { createPurchaseReceivingRepository, normalizePurchaseReceivingState } from "./repository.js";
import { safePurchaseReceivingClone } from "./security.js";

const PROHIBITED_OPTIONS = new Set([
  "mode", "persistenceMode", "remoteDataSource", "request", "remoteActive", "explicitRemoteActivation",
  "sync", "syncEngine", "migrationApply", "migrationExecutor", "rollbackExecutor", "providerNetworkAccess",
]);

export const PURCHASE_INVENTORY_MUTATION_LOCK = "code3:owner-confirmed-purchase-inventory:v1";

export class PurchaseReceivingPersistenceError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "PurchaseReceivingPersistenceError";
    this.code = code;
    this.details = details;
  }
}

function rejectCallerMode(options) {
  const prohibited = Object.keys(options || {}).find((key) => PROHIBITED_OPTIONS.has(key));
  if (prohibited) {
    throw new PurchaseReceivingPersistenceError(
      "PERSISTENCE_MODE_NOT_CALLER_SELECTABLE",
      "Purchase/Receiving is fixed to LOCAL_ONLY and does not accept remote activation options.",
      { field: prohibited },
    );
  }
}

/** Whole-state transactions keep draft confirmation and idempotency indices in one localStorage write. */
export function createPurchaseReceivingPersistence(options = {}) {
  rejectCallerMode(options);
  const repository = options.repository || createPurchaseReceivingRepository(options.storage, { now: options.now });
  const lockManager = options.lockManager;

  function read() {
    return safePurchaseReceivingClone(repository.load());
  }

  function replace(nextState) {
    return safePurchaseReceivingClone(repository.save(normalizePurchaseReceivingState(nextState, { now: options.now })));
  }

  function transact(mutator) {
    if (typeof mutator !== "function") throw new PurchaseReceivingPersistenceError("MUTATOR_REQUIRED", "A synchronous state mutator is required.");
    const current = read();
    const outcome = mutator(safePurchaseReceivingClone(current));
    if (outcome && typeof outcome.then === "function") throw new PurchaseReceivingPersistenceError("ASYNC_MUTATOR_REJECTED", "Local state transactions must be synchronous.");
    const nextState = outcome?.state || outcome;
    if (!nextState || typeof nextState !== "object" || Array.isArray(nextState)) {
      throw new PurchaseReceivingPersistenceError("INVALID_TRANSACTION_RESULT", "State transaction must return a state object.");
    }
    const saved = replace(nextState);
    return Object.freeze({ state: saved, result: safePurchaseReceivingClone(outcome?.result ?? null) });
  }

  function withMutationLock(action) {
    if (typeof lockManager === "function") return lockManager(PURCHASE_INVENTORY_MUTATION_LOCK, action);
    // Deterministic Node-domain tests do not represent a browser document and
    // therefore do not participate in same-origin tab concurrency. Check this
    // before Node's partial navigator.locks implementation, which can leave
    // sequential top-level test awaits unsettled.
    if (typeof window === "undefined") return Promise.resolve().then(action);
    if (globalThis.navigator?.locks?.request) {
      return globalThis.navigator.locks.request(PURCHASE_INVENTORY_MUTATION_LOCK, { mode: "exclusive" }, action);
    }
    throw new PurchaseReceivingPersistenceError(
      "SAFE_LOCK_UNAVAILABLE",
      "Purchase and Receiving mutation requires same-origin exclusive locking.",
    );
  }

  function transactLocked(mutator) {
    return withMutationLock(() => transact(mutator));
  }

  return Object.freeze({
    mode: "LOCAL_ONLY",
    authoritative: "LOCAL_ONLY",
    remoteActive: false,
    syncAvailable: false,
    repository,
    read,
    replace,
    transact,
    transactLocked,
  });
}
