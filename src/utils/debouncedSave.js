// Debounced save (audit 2026-11-14).
//
// The whole local store used to be re-validated, serialized and written to
// localStorage on every state change, including every keystroke in a bound
// form. schedule() keeps only the newest write and runs it once things settle;
// flush() runs a pending write right away (used when the page is hidden or
// closed so nothing is lost).
export function createDebouncedSaver(delayMs = 400, { setTimer = globalThis.setTimeout, clearTimer = globalThis.clearTimeout } = {}) {
  let pending = null;
  let timer = null;

  function run() {
    timer = null;
    const write = pending;
    pending = null;
    if (write) write();
  }

  return {
    schedule(write) {
      pending = write;
      if (timer !== null) clearTimer(timer);
      timer = setTimer(run, delayMs);
    },
    flush() {
      if (timer !== null) clearTimer(timer);
      run();
    },
    cancel() {
      if (timer !== null) clearTimer(timer);
      timer = null;
      pending = null;
    },
    hasPending() {
      return pending !== null;
    },
  };
}

/** Flush the saver whenever the page is hidden or unloaded. Returns a cleanup function. */
export function flushSaverOnPageHide(saver, target = globalThis.window) {
  if (!target?.addEventListener) return () => {};
  const flush = () => saver.flush();
  const onVisibility = () => { if (target.document?.visibilityState === "hidden") saver.flush(); };
  target.addEventListener("pagehide", flush);
  target.document?.addEventListener?.("visibilitychange", onVisibility);
  return () => {
    target.removeEventListener("pagehide", flush);
    target.document?.removeEventListener?.("visibilitychange", onVisibility);
    saver.flush();
  };
}
