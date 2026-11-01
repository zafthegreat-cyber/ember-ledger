// Device notifications for in-app alerts (2026-10-30, tester reaction #12:
// "The restock alert I set up never pinged me").
//
// Code 3 TCG has no push provider yet, so alerts only ever appeared inside
// the Alerts panel. This module uses the browser's Notification API so a
// confirmed restock or a watched-store report can still buzz the device while
// the app is open or installed to the home screen. It is honest about the
// limit: nothing is delivered while the app is fully closed until a push
// provider is approved.

import { plainLanguageText } from "../config/plainLanguage.js";

export const DEVICE_NOTIFICATION_SEEN_KEY = "code3_device_notification_seen_v1";
const MAX_SEEN = 400;
const ANNOUNCE_CATEGORIES = new Set([
  "confirmed_restock",
  "favorite_store_alert",
  "saved_product_alert",
  "predicted_restock_window",
  "family_friendly_shop_update",
  "scout_report_status",
  "kids_program_update",
  "admin_message_status",
]);

export function deviceNotificationSupport(globalObject = globalThis) {
  const api = globalObject?.Notification;
  if (typeof api !== "function" || typeof api.requestPermission !== "function") {
    return { supported: false, permission: "unsupported", label: "This browser cannot show device alerts. Alerts still appear inside the app." };
  }
  const permission = String(api.permission || "default");
  if (permission === "granted") return { supported: true, permission, label: "Device alerts are on for this browser while Code 3 TCG is open or installed." };
  if (permission === "denied") return { supported: true, permission, label: "Device alerts are blocked in this browser's site settings. Allow notifications there to turn them on." };
  return { supported: true, permission, label: "Device alerts are off. Turn them on to get a notification here when a watched store restocks." };
}

export async function requestDeviceNotifications(globalObject = globalThis) {
  const support = deviceNotificationSupport(globalObject);
  if (!support.supported) return support;
  if (support.permission === "granted" || support.permission === "denied") return support;
  try {
    const result = await globalObject.Notification.requestPermission();
    return deviceNotificationSupport({ Notification: { ...globalObject.Notification, permission: result, requestPermission: globalObject.Notification.requestPermission } });
  } catch {
    return deviceNotificationSupport(globalObject);
  }
}

function readSeen(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem(DEVICE_NOTIFICATION_SEEN_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function writeSeen(storage, ids) {
  try { storage?.setItem(DEVICE_NOTIFICATION_SEEN_KEY, JSON.stringify(ids.slice(-MAX_SEEN))); } catch { /* best effort */ }
}

export function selectNotificationsToAnnounce(rows = [], seenIds = [], { now = Date.now(), maxAgeMs = 6 * 60 * 60 * 1000 } = {}) {
  const seen = new Set(seenIds.map(String));
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row && row.id && !seen.has(String(row.id)))
    .filter((row) => !row.read && !row.readAt && !row.dismissedAt)
    .filter((row) => ANNOUNCE_CATEGORIES.has(String(row.category || "")))
    .filter((row) => {
      const created = Date.parse(row.createdAt || row.created_at || "");
      return !Number.isFinite(created) || now - created <= maxAgeMs;
    })
    .slice(0, 3);
}

/**
 * Show device notifications for new alert rows and remember which ones were
 * shown. Safe to call on every render: it only acts when permission is granted
 * and returns the number of notifications shown.
 */
export function announceNewNotifications(rows = [], { storage = globalThis.localStorage, globalObject = globalThis, firstRun = false } = {}) {
  const support = deviceNotificationSupport(globalObject);
  const seen = readSeen(storage);
  if (firstRun || !seen.length) {
    // First pass: mark everything already in the panel as seen so an existing
    // backlog does not fire a burst of notifications.
    writeSeen(storage, rows.map((row) => String(row?.id || "")).filter(Boolean));
    return 0;
  }
  const fresh = selectNotificationsToAnnounce(rows, seen);
  if (!fresh.length) return 0;
  writeSeen(storage, [...seen, ...rows.map((row) => String(row?.id || "")).filter(Boolean)]);
  if (support.permission !== "granted") return 0;
  let shown = 0;
  for (const row of fresh) {
    try {
      const title = plainLanguageText(String(row.title || "Code 3 TCG alert")).slice(0, 80);
      const body = plainLanguageText(String(row.message || row.body || row.detail || "")).slice(0, 160);
      new globalObject.Notification(title, { body, tag: `code3-${row.id}`, silent: false });
      shown += 1;
    } catch {
      // A blocked or throttled notification is not an error worth surfacing.
    }
  }
  return shown;
}
