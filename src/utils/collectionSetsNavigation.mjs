// Store only opaque navigation tokens in browser history. The caller resolves
// each frame against the current permitted collection before showing it again.
export function createCollectionSetsNavigation({ target, resolve, onChange }) {
  const key = "code3CollectionSetsNavigation";
  const frames = new Map();
  const prefix = target.crypto?.randomUUID?.() || `sets-${Math.random().toString(36).slice(2)}`;
  let sequence = 0;
  let disposed = false;
  let pending = null;
  const token = () => target.history.state?.[key];
  const signature = () => { try { return JSON.stringify(target.history.state); } catch { return null; } };
  const strip = () => {
    const state = { ...(target.history.state || {}) };
    delete state[key];
    target.history.replaceState(state, "", target.location.href);
  };
  if (token()) strip();
  const frameHere = () => {
    const frame = frames.get(token());
    return frame?.url === target.location.href && frame.signature !== null && frame.signature === signature() ? frame : null;
  };
  const handlePop = () => {
    if (disposed) return;
    if (pending) { target.clearTimeout(pending); pending = null; }
    const frame = frameHere();
    const permitted = frame ? resolve(frame.selection) : null;
    if (frame && !permitted) strip();
    onChange(permitted);
  };
  target.addEventListener("popstate", handlePop);
  return {
    open(selection) {
      if (disposed || pending) return false;
      const permitted = resolve(selection);
      if (!permitted) return false;
      const frame = { selection, url: target.location.href };
      const next = `${prefix}-${++sequence}`;
      try { target.history.pushState({ ...(target.history.state || {}), [key]: next }, "", frame.url); } catch { return false; }
      frame.signature = signature();
      frames.set(next, frame);
      onChange(permitted);
      return true;
    },
    back(fallback = null) {
      if (disposed || pending) return false;
      if (!frameHere()) { onChange(fallback ? resolve(fallback) : null); return true; }
      const closingFrame = frameHere();
      pending = target.setTimeout(() => {
        pending = null;
        // Failed traversal cannot run another action or overwrite foreign state.
        if (frameHere() !== closingFrame) return;
        strip();
        if (!disposed) onChange(fallback ? resolve(fallback) : null);
      }, 1500);
      try { target.history.back(); } catch {
        target.clearTimeout(pending); pending = null;
        if (frameHere() !== closingFrame) return false;
        strip();
        onChange(fallback ? resolve(fallback) : null);
      }
      return true;
    },
    destroy() {
      disposed = true;
      if (pending) target.clearTimeout(pending);
      pending = null;
      target.removeEventListener("popstate", handlePop);
      if (frameHere()) strip();
      frames.clear();
    },
  };
}
