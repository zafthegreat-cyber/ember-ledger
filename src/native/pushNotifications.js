// Phone push notifications (Firebase Cloud Messaging), Nov 15, 2026.
//
// Only runs inside the Android/iOS app, only after the person turns device
// alerts on, and only in builds made with Firebase configured
// (VITE_PUSH_ENABLED=true, set by the Android release workflow when the
// GOOGLE_SERVICES_JSON_BASE64 secret exists). Without Firebase the native
// register() call can crash the app, so the flag check comes first.
// Setup steps: docs/PUSH_NOTIFICATIONS_SETUP.md.
import { isNativePlatform } from "./nativeRuntime.js";

const env = import.meta.env || {};
export const PUSH_CHANNEL_ID = "restocks";

export function nativePushAvailable({ native = isNativePlatform(), flag = env.VITE_PUSH_ENABLED } = {}) {
  return native && String(flag || "") === "true";
}

let registering = null;

/**
 * Ask for permission, register with Firebase and save the device token for the
 * signed-in account. Resolves to { ok, permission, label }.
 */
export function enableNativePush({ supabase, prompt = true, appVersion = env.VITE_APP_VERSION || "", loadPlugin = () => import("@capacitor/push-notifications") } = {}) {
  if (!nativePushAvailable()) return Promise.resolve({ ok: false, permission: "unsupported", label: "Phone alerts aren't available in this version of the app yet." });
  if (registering) return registering;
  registering = (async () => {
    const { PushNotifications } = await loadPlugin();
    let status = await PushNotifications.checkPermissions();
    if (!prompt && status.receive !== "granted") return { ok: false, permission: status.receive, label: "" };
    if (status.receive === "prompt" || status.receive === "prompt-with-rationale") status = await PushNotifications.requestPermissions();
    if (status.receive !== "granted") {
      return { ok: false, permission: "denied", label: "Notifications are off for Code 3 TCG. Turn them on in your phone's settings to get restock alerts." };
    }
    try {
      await PushNotifications.createChannel?.({ id: PUSH_CHANNEL_ID, name: "Restock alerts", description: "Restocks and wants alerts near you", importance: 4 });
    } catch { /* iOS has no channels */ }
    const token = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timeout")), 20000);
      PushNotifications.addListener("registration", (value) => { clearTimeout(timer); resolve(value?.value || ""); });
      PushNotifications.addListener("registrationError", (error) => { clearTimeout(timer); reject(new Error(error?.error || "registration failed")); });
      PushNotifications.register().catch((error) => { clearTimeout(timer); reject(error); });
    });
    if (!token) throw new Error("no token");
    if (supabase) {
      const platform = globalThis.Capacitor?.getPlatform?.() === "ios" ? "ios" : "android";
      const { error } = await supabase.rpc("register_push_token", { p_token: token, p_platform: platform, p_app_version: appVersion || null });
      if (error) throw error;
    }
    return { ok: true, permission: "granted", label: "Phone alerts are on. You'll get a notification when a watched store restocks." };
  })().catch(() => ({ ok: false, permission: "error", label: "Phone alerts couldn't be turned on right now. Alerts still appear inside the app." }))
    .finally(() => { registering = null; });
  return registering;
}
