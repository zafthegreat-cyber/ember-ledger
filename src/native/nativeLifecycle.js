import { isNativePlatform, parseNativeAuthCallback } from "./nativeRuntime.js";

// StrictMode and native view remounts can overlap. An authorization code is
// single-use; share its in-flight exchange for this client instead of consuming
// it twice. No token or code is written to browser storage.
const clientExchanges = new WeakMap();
let activeCleanup = null;
function exchangeOnce(client, code) {
  let state = clientExchanges.get(client);
  if (!state) { state = { pending: new Map(), completed: new Map() }; clientExchanges.set(client, state); }
  if (state.completed.has(code)) return Promise.resolve(state.completed.get(code));
  if (!state.pending.has(code)) {
    const promise = Promise.resolve().then(() => client.auth.exchangeCodeForSession(code)).then(({ error }) => {
      if (error) throw new Error("This sign-in link has expired or was opened on a different device. Request a new link from this app.");
      const result = { navigated: false };
      state.completed.set(code, result);
      if (state.completed.size > 100) state.completed.delete(state.completed.keys().next().value);
      return result;
    }).finally(() => state.pending.delete(code));
    state.pending.set(code, promise);
  }
  return state.pending.get(code);
}

const LEAVE_WINDOW_MS = 2000;
const HOME_PATHS = new Set(["/", "/find/home", "/sell/home"]);
function isHomePath(pathname) { return HOME_PATHS.has(String(pathname || "/").replace(/\/+$/, "") || "/"); }
// A small, self-removing notice; the app keeps running if the DOM is unavailable.
function showLeaveHint() {
  try {
    const existing = document.getElementById("code3-leave-hint");
    if (existing) existing.remove();
    const hint = document.createElement("div");
    hint.id = "code3-leave-hint"; hint.setAttribute("role", "status");
    hint.textContent = "Press back again to leave Code 3";
    hint.style.cssText = "position:fixed;left:50%;bottom:calc(88px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:2147483000;padding:10px 16px;border-radius:999px;background:#1f1f1fee;color:#fff;font:600 14px/1.3 system-ui,sans-serif;box-shadow:0 4px 14px #0006;pointer-events:none;";
    document.body.appendChild(hint);
    setTimeout(() => hint.remove(), LEAVE_WINDOW_MS);
  } catch { /* hint is optional */ }
}

export async function startNativeLifecycle({ client, onAuthError = () => {}, onSocialCallback, signal } = {}) {
  if (!isNativePlatform() || signal?.aborted) return () => {};
  activeCleanup?.();
  let disposed = false;
  let lastHomeBack = 0;
  let processing = false;
  const listeners = [];
  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    signal?.removeEventListener("abort", cleanup);
    listeners.splice(0).forEach(listener => { Promise.resolve(listener.remove()).catch(() => {}); });
    client?.auth.stopAutoRefresh();
    if (activeCleanup === cleanup) activeCleanup = null;
  };
  activeCleanup = cleanup;
  signal?.addEventListener("abort", cleanup, { once: true });
  let App;
  try { ({ App } = await import("@capacitor/app")); }
  catch (error) { cleanup(); throw error; }
  if (disposed) return cleanup;
  const handleUrl = async ({ url }) => {
    const callback = parseNativeAuthCallback(url);
    if (!callback || disposed || processing) return;
    if ((callback.error && callback.flow !== "oauth") || !client) { onAuthError("This sign-in link could not be verified. Request a new link from the app."); return; }
    processing = true;
    try {
      const social = callback.flow === "oauth";
      if (social && !onSocialCallback) throw new Error("Social sign-in is not configured.");
      const exchanged = social ? await onSocialCallback(callback) : await exchangeOnce(client, callback.code);
      if (disposed || exchanged.navigated) return;
      // Recovery UI is already handled by the existing reset-password route.
      const next = social ? exchanged.path : callback.flow === "recovery" ? "/reset-password" : "/";
      history.replaceState({}, "", next);
      exchanged.navigated = true;
      window.dispatchEvent(new PopStateEvent("popstate"));
    } catch { if (!disposed) onAuthError("This sign-in link could not be verified. Request a new link from this app and try again."); }
    finally { processing = false; }
  };
  const listen = async (name, callback) => {
    const listener = await App.addListener(name, callback);
    if (disposed) await listener.remove(); else listeners.push(listener);
  };
  try {
    await Promise.all([
    listen("appUrlOpen", handleUrl),
    listen("appStateChange", ({ isActive }) => {
      if (disposed) return;
      if (isActive) {
        client?.auth.startAutoRefresh();
        window.dispatchEvent(new Event("focus"));
      } else { client?.auth.stopAutoRefresh(); }
    }),
    listen("backButton", ({ canGoBack }) => {
      if (disposed) return;
      // Let the existing modal Escape handlers close an overlay before moving
      // through the existing route history. Never exit an unsaved form silently.
      const dialogs = [...document.querySelectorAll('[role="dialog"], dialog[open]')].filter(dialog => dialog.getClientRects().length && dialog.getAttribute("aria-hidden") !== "true");
      if (dialogs.length) {
        const dialog = dialogs.at(-1);
        const target = dialog.contains(document.activeElement) ? document.activeElement : dialog;
        // Start at the focused control so React onKeyDown, document handlers,
        // and the existing window handler all receive the normal bubbling path.
        target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
      } else if (canGoBack && history.length > 1) { history.back(); }
      else if (!isHomePath(globalThis.location?.pathname)) {
        // Many screens switch in place without a history entry. Back should
        // land on Home instead of sending Code 3 to the background.
        history.replaceState({}, "", "/");
        window.dispatchEvent(new PopStateEvent("popstate"));
      } else if (Date.now() - lastHomeBack < LEAVE_WINDOW_MS) { lastHomeBack = 0; App.minimizeApp(); }
      else { lastHomeBack = Date.now(); showLeaveHint(); }
    }),
    ]);
    if (disposed) return cleanup;
    const launch = await App.getLaunchUrl();
    if (!disposed && launch) await handleUrl(launch);
    if (!disposed) client?.auth.startAutoRefresh();
    return cleanup;
  } catch (error) { cleanup(); throw error; }
}
