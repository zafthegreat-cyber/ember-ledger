export const RESTOCK_DETAILS_HISTORY_KEY = "code3ScoutReportDetails";

// History stores only an opaque UI token. Reports remain in the existing
// permitted in-memory collection and are resolved again before Forward opens.
export function createRestockDetailsHistory({ target, resolveReport, onOpen, onClose, timeoutMs = 1500 }) {
  const known = new Map();
  let active = null;
  let pending = null;
  let disposed = false;
  let sequence = 0;
  const prefix = target.crypto?.randomUUID?.() || `report-${Math.random().toString(36).slice(2)}`;
  const currentToken = () => target.history.state?.[RESTOCK_DETAILS_HISTORY_KEY];
  const signature = (state) => {
    try { return JSON.stringify(state || {}); } catch { return null; }
  };
  const owns = (frame) => frame && currentToken() === frame.token && target.location.href === frame.url
    && frame.stateSignature !== null && signature(target.history.state) === frame.stateSignature;
  const strip = (token) => {
    if (currentToken() !== token) return;
    const state = { ...(target.history.state || {}) };
    delete state[RESTOCK_DETAILS_HISTORY_KEY];
    target.history.replaceState(state, "", target.location.href);
  };
  // A reload cannot restore a report or a draft from an old UI token.
  if (currentToken()) strip(currentToken());

  function abortPending() {
    if (!pending) return;
    const frame = pending.frame;
    target.clearTimeout(pending.timer);
    pending = null;
    active = null;
    if (owns(frame)) strip(frame.token);
    if (!disposed) onClose();
  }

  function handlePop() {
    if (disposed) return;
    if (pending) {
      const closing = pending;
      target.clearTimeout(closing.timer);
      pending = null;
      active = null;
      onClose();
      // Traversal has completed before the existing App flow may push its own
      // entry. A different route or a failed traversal must not launch a flow.
      if (target.location.href === closing.frame.url && closing.frame.parentSignature !== null
        && signature(target.history.state) === closing.frame.parentSignature) closing.after?.();
      return;
    }
    if (active && !owns(active)) {
      active = null;
      onClose();
    }
    const frame = known.get(currentToken());
    if (!owns(frame)) return;
    const report = resolveReport(frame.report);
    if (!report) {
      strip(frame.token);
      return;
    }
    active = frame;
    onOpen(report);
  }
  target.addEventListener("popstate", handlePop);

  return {
    open(report) {
      if (disposed || pending) return false;
      const permitted = resolveReport(report);
      if (!permitted) return false;
      if (owns(active)) {
        active.report = permitted;
        onOpen(permitted);
        return true;
      }
      const frame = { token: `${prefix}-${++sequence}`, report: permitted, url: target.location.href, parentSignature: signature(target.history.state) };
      target.history.pushState({ ...(target.history.state || {}), [RESTOCK_DETAILS_HISTORY_KEY]: frame.token }, "", frame.url);
      frame.stateSignature = signature(target.history.state);
      known.set(frame.token, frame);
      active = frame;
      onOpen(permitted);
      return true;
    },
    dismiss(after) {
      if (disposed || pending || !active) return false;
      if (!owns(active)) {
        active = null;
        onClose();
        return false;
      }
      pending = { frame: active, after, timer: null };
      // This timer only cancels a failed traversal; it never runs a handoff.
      pending.timer = target.setTimeout(abortPending, timeoutMs);
      try { target.history.back(); } catch { abortPending(); }
      return true;
    },
    destroy() {
      disposed = true;
      target.removeEventListener("popstate", handlePop);
      if (pending) target.clearTimeout(pending.timer);
      pending = null;
      const token = currentToken();
      const frame = known.get(token);
      if (owns(frame)) strip(token);
      active = null;
      known.clear();
    },
  };
}
