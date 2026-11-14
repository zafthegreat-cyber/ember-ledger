const ZERO = Object.freeze({ pitch: 0, yaw: 0, x: 0, y: 0 });
const clamp = value => Math.max(-1, Math.min(1, value));
const wrapped = value => ((value + 180) % 360 + 360) % 360 - 180;
const finite = value => typeof value === "number" && Number.isFinite(value);
const round = value => Math.abs(value) < .0005 ? 0 : Math.round(value * 1000) / 1000;

// Phone angles are relative to the first valid sample, never the user's location.
// Screen rotation keeps left/right tilt consistent in both landscape orientations.
export function catalogTiltFromOrientation(sample, baseline, angle = 0) {
  if (![sample?.beta, sample?.gamma, baseline?.beta, baseline?.gamma, angle].every(finite)) return null;
  const radians = angle * Math.PI / 180;
  const horizontal = wrapped(sample.gamma - baseline.gamma);
  const vertical = wrapped(sample.beta - baseline.beta);
  const x = clamp((horizontal * Math.cos(radians) + vertical * Math.sin(radians)) / 28);
  const y = clamp((vertical * Math.cos(radians) - horizontal * Math.sin(radians)) / 28);
  return { pitch: round(-y * 8), yaw: round(x * 8), x: round(x), y: round(y) };
}

// One controller/listener/frame serves every visible catalog item. Exporting the
// factory allows deterministic sensor-event tests without touching device APIs.
export function createCatalogMotionController({ window: target, document: page = target?.document } = {}) {
  const tiltListeners = new Set(), stateListeners = new Set();
  const coarse = target?.matchMedia?.("(any-pointer: coarse)");
  const reduced = target?.matchMedia?.("(prefers-reduced-motion: reduce)");
  const needsPermission = typeof target?.DeviceOrientationEvent?.requestPermission === "function";
  let permission = needsPermission ? "prompt" : "granted";
  let enabled = true, requesting = false, listening = false, watching = false;
  let baseline = null, queued = null, frame = null, lastPose = ZERO, hasSample = false;
  let cachedState;
  const supported = () => Boolean(target && "DeviceOrientationEvent" in target && coarse?.matches);
  const screenAngle = () => {
    const value = target?.screen?.orientation?.angle ?? target?.orientation ?? 0;
    return finite(value) ? value : 0;
  };
  const schedule = callback => target.requestAnimationFrame ? target.requestAnimationFrame(callback) : target.setTimeout(callback, 16);
  const cancel = id => target.cancelAnimationFrame ? target.cancelAnimationFrame(id) : target.clearTimeout(id);
  function getState() {
    const available = supported(), reduce = Boolean(reduced?.matches), hidden = Boolean(page?.hidden);
    const status = !available ? "unsupported" : reduce ? "reduced-motion" : requesting ? "requesting"
      : permission === "denied" ? "denied" : permission !== "granted" ? "permission-required"
      : !enabled ? "off" : hidden ? "paused" : hasSample && listening ? "active" : "ready";
    const next = { status, enabled: enabled && permission === "granted" && available && !reduce, permission };
    if (!cachedState || Object.keys(next).some(key => next[key] !== cachedState[key])) cachedState = Object.freeze(next);
    return cachedState;
  }
  function notifyState() { const state = getState(); for (const callback of stateListeners) callback(state); }
  function emit(pose) {
    if (Object.keys(ZERO).every(key => pose[key] === lastPose[key])) return;
    lastPose = Object.freeze({ ...pose });
    for (const callback of tiltListeners) callback(lastPose);
  }
  function reset() {
    baseline = null; queued = null; hasSample = false;
    if (frame !== null) { cancel(frame); frame = null; }
    emit(ZERO);
  }
  function orientation(event) {
    if (!finite(event.beta) || !finite(event.gamma) || !listening) return;
    const angle = screenAngle();
    if (!baseline || baseline.angle !== angle) {
      baseline = { beta: event.beta, gamma: event.gamma, angle };
      emit(ZERO);
    }
    if (!hasSample) { hasSample = true; notifyState(); }
    queued = catalogTiltFromOrientation(event, baseline, angle);
    if (frame === null) frame = schedule(() => {
      frame = null;
      if (queued && listening) emit(queued);
      queued = null;
    });
  }
  function reconcile() {
    const shouldListen = tiltListeners.size > 0 && supported() && !reduced?.matches
      && !page?.hidden && enabled && permission === "granted" && !requesting;
    if (shouldListen && !listening) {
      listening = true; baseline = null;
      target.addEventListener("deviceorientation", orientation, { passive: true });
    } else if (!shouldListen && listening) {
      listening = false; target.removeEventListener("deviceorientation", orientation);
      reset();
    }
    notifyState();
  }
  function reorient() { reset(); reconcile(); }
  const mediaWatch = (query, callback, add) => {
    if (query?.addEventListener) query[add ? "addEventListener" : "removeEventListener"]("change", callback);
    else query?.[add ? "addListener" : "removeListener"]?.(callback);
  };
  function watch() {
    if (watching || !target) return;
    watching = true;
    page?.addEventListener("visibilitychange", reconcile);
    target.addEventListener("orientationchange", reorient);
    target.screen?.orientation?.addEventListener?.("change", reorient);
    mediaWatch(coarse, reconcile, true); mediaWatch(reduced, reconcile, true);
  }
  function unwatchIfUnused() {
    if (tiltListeners.size || stateListeners.size || !watching) return;
    watching = false;
    page?.removeEventListener("visibilitychange", reconcile);
    target.removeEventListener("orientationchange", reorient);
    target.screen?.orientation?.removeEventListener?.("change", reorient);
    mediaWatch(coarse, reconcile, false); mediaWatch(reduced, reconcile, false);
    reset();
  }
  return {
    getState,
    subscribeTilt(callback) {
      if (typeof callback !== "function") return () => {};
      tiltListeners.add(callback); watch(); reconcile(); callback(lastPose);
      return () => { tiltListeners.delete(callback); reconcile(); unwatchIfUnused(); };
    },
    subscribeState(callback) {
      if (typeof callback !== "function") return () => {};
      stateListeners.add(callback); watch(); callback(getState());
      return () => { stateListeners.delete(callback); unwatchIfUnused(); };
    },
    setEnabled(value) { enabled = Boolean(value); reconcile(); return getState(); },
    async requestPermission() {
      if (!supported() || reduced?.matches || requesting) return getState();
      enabled = true;
      if (needsPermission && permission !== "granted") {
        requesting = true; reconcile();
        try {
          // Called only by a user's button action; never from mounting/subscribing.
          const result = await target.DeviceOrientationEvent.requestPermission();
          permission = result === "granted" ? "granted" : "denied";
        } catch { permission = "denied"; }
        requesting = false;
      }
      reconcile(); return getState();
    },
    recalibrate() { reset(); reconcile(); },
  };
}

let shared = null, sharedWindow;
function controller() {
  const target = typeof window === "undefined" ? undefined : window;
  if (!shared || sharedWindow !== target) {
    sharedWindow = target;
    shared = createCatalogMotionController({ window: target });
  }
  return shared;
}
export const subscribeCatalogTilt = callback => controller().subscribeTilt(callback);
export const getCatalogMotionState = () => controller().getState();
export const subscribeCatalogMotionState = callback => controller().subscribeState(callback);
export const requestCatalogMotionPermission = () => controller().requestPermission();
export const setCatalogMotionEnabled = enabled => controller().setEnabled(enabled);
export const recalibrateCatalogMotion = () => controller().recalibrate();
