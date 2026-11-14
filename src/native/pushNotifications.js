// Phone push notifications for the Android/iOS apps (store audit 2026-11-14).
//
// After the person turns alerts on, the app asks for notification permission,
// gets this device's push token and saves it with register_push_token(), so
// the send-push edge function can reach the phone even when the app is closed.
// Android delivers through Firebase and needs google-services.json in the
// build; iOS delivers through Apple (APNs) directly.
import { isNativePlatform } from "./nativeRuntime.js";

const env = import.meta.env || {};
const REGISTER_TIMEOUT_MS = 15_000;

export function nativePushPlatform() {
  return isNativePlatform() ? String(globalThis.Capacitor?.getPlatform?.() || "") : "";
}

export function nativePushAvailable(platform = nativePushPlatform(), androidConfigured = env.VITE_ANDROID_PUSH_CONFIGURED === "true") {
  // Registering on Android without Firebase configured crashes the app.
  return platform === "ios" || (platform === "android" && androidConfigured);
}

const LABELS = {
  granted: "Phone alerts are on. You'll get a notification when a watched store restocks, even with the app closed.",
  denied: "Notifications are turned off for Code 3 TCG in your phone's settings. Turn them on there to get alerts.",
  prompt: "Phone alerts are off. Turn them on to get a notification when a watched store restocks.",
  unavailable: "Phone alerts aren't available in this version. Alerts still appear inside the app.",
  error: "Phone alerts couldn't be turned on. Try again in a moment.",
};
const state = (permission) => ({ supported: permission !== "unavailable", permission, label: LABELS[permission] });

async function plugin() {
  const { PushNotifications } = await import("@capacitor/push-notifications");
  return PushNotifications;
}

export async function nativePushSupport({ load = plugin, available = nativePushAvailable() } = {}) {
  if (!available) return state("unavailable");
  try {
    const { receive } = await (await load()).checkPermissions();
    return state(receive === "granted" ? "granted" : receive === "denied" ? "denied" : "prompt");
  } catch {
    return state("unavailable");
  }
}

/** Ask permission, get the device token and save it for the signed-in account. */
export async function enableNativePush({ client, appVersion = "", load = plugin, platform = nativePushPlatform(), available = nativePushAvailable(platform) } = {}) {
  if (!available) return state("unavailable");
  try {
    const PushNotifications = await load();
    let { receive } = await PushNotifications.checkPermissions();
    if (receive !== "granted" && receive !== "denied") ({ receive } = await PushNotifications.requestPermissions());
    if (receive !== "granted") return state("denied");
    if (platform === "android") {
      await PushNotifications.createChannel({ id: "restocks", name: "Restock alerts", description: "Watched stores and confirmed restocks", importance: 4 }).catch(() => {});
    }
    const token = await new Promise((resolve, reject) => {
      const handles = [];
      const done = (fn, value) => { clearTimeout(timer); handles.forEach((handle) => handle.then((h) => h.remove()).catch(() => {})); fn(value); };
      const timer = setTimeout(() => done(reject, new Error("Push registration timed out.")), REGISTER_TIMEOUT_MS);
      handles.push(PushNotifications.addListener("registration", ({ value }) => done(resolve, value)));
      handles.push(PushNotifications.addListener("registrationError", (error) => done(reject, new Error(error?.error || "Push registration failed."))));
      PushNotifications.register().catch((error) => done(reject, error));
    });
    if (!client) return state("error");
    const { error } = await client.rpc("register_push_token", { p_token: String(token), p_platform: platform, p_app_version: String(appVersion || "").slice(0, 100) || null });
    return state(error ? "error" : "granted");
  } catch {
    return state("error");
  }
}

/** Open the screen a tapped notification points at (send-push puts a relative path in data.url). */
export async function listenForPushOpens(onOpenPath, { load = plugin, available = nativePushAvailable() } = {}) {
  if (!available) return () => {};
  try {
    const handle = await (await load()).addListener("pushNotificationActionPerformed", ({ notification }) => {
      const path = notification?.data?.url;
      if (typeof path === "string" && /^\/[A-Za-z0-9/_\-?=&.%]*$/.test(path)) onOpenPath(path);
    });
    return () => { handle.remove().catch(() => {}); };
  } catch {
    return () => {};
  }
}
