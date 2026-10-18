export const BOT_OPS_WRITE_LOCK = "code3.bot-ops-write.v1";

const queues = new WeakMap();

export class BotOpsCoordinationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "BotOpsCoordinationError";
    this.code = code;
  }
}

export function isBrowserBotOpsStorage(storage) {
  try { return typeof window !== "undefined" && storage === window.localStorage; }
  catch { return true; }
}

// Browser writes require the same origin-wide Web Lock in every tab. The queue
// below is only for injected non-browser stores used by tests and host adapters.
export function botOpsExclusive(storage, options = {}) {
  const browserStorage = isBrowserBotOpsStorage(storage);
  const locks = options.locks ?? (browserStorage ? globalThis.navigator?.locks : null);
  return (operation) => {
    if (locks?.request) return locks.request(BOT_OPS_WRITE_LOCK, { mode: "exclusive" }, operation);
    if (browserStorage || options.requireCrossTabLock) {
      return Promise.reject(new BotOpsCoordinationError("LOCK_UNAVAILABLE", "This browser cannot safely coordinate Bot Operations saves. Use a browser with Web Locks support."));
    }
    if (!storage || typeof storage !== "object") return Promise.reject(new BotOpsCoordinationError("STORAGE_UNAVAILABLE", "Bot Operations storage is unavailable."));
    const previous = queues.get(storage) || Promise.resolve();
    const next = previous.catch(() => {}).then(operation);
    const settled = next.then(() => {}, () => {});
    queues.set(storage, settled);
    void settled.then(() => { if (queues.get(storage) === settled) queues.delete(storage); });
    return next;
  };
}
