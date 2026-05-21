import assert from "node:assert/strict";
import {
  IN_APP_ALERT_DISCLOSURE,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_PREFERENCE_ROWS,
  makeNotification,
  mergeNotificationRows,
  normalizeNotificationCategory,
  normalizeNotificationPreferences,
  notificationCategoryLabel,
  notificationEnabled,
  notificationTrustLabel,
  unreadNotificationCount,
  upsertNotificationState,
} from "../src/utils/notificationCenterUtils.js";

assert.equal(normalizeNotificationCategory("Confirmed Restock"), NOTIFICATION_CATEGORIES.CONFIRMED_RESTOCK);
assert.equal(normalizeNotificationCategory("possible prediction window"), NOTIFICATION_CATEGORIES.PREDICTED_RESTOCK_WINDOW);
assert.equal(normalizeNotificationCategory("community guess reviewed"), NOTIFICATION_CATEGORIES.COMMUNITY_GUESS_UPDATE);
assert.equal(notificationCategoryLabel("family friendly shop"), "Family-Friendly Shop");

const preferences = normalizeNotificationPreferences({
  confirmed_restocks: true,
  predicted_windows: false,
  stock_alerts: false,
  wishlist_matches: true,
});
assert.equal(preferences.confirmed_restocks, false, "legacy stock alert toggle should map to confirmed restocks");
assert.equal(preferences.predicted_windows, false);
assert.equal(preferences.saved_products, true);
assert.equal(notificationEnabled(preferences, NOTIFICATION_CATEGORIES.PREDICTED_RESTOCK_WINDOW), false);

const confirmed = makeNotification({
  category: NOTIFICATION_CATEGORIES.CONFIRMED_RESTOCK,
  title: "Confirmed restock reported at Greenbrier Target.",
  message: "Confirmed report.",
  dedupeKey: "restock:gb-target",
  createdAt: "2026-05-21T12:00:00.000Z",
});
const predicted = makeNotification({
  category: NOTIFICATION_CATEGORIES.PREDICTED_RESTOCK_WINDOW,
  title: "Possible restock window.",
  message: "Possible only.",
  dedupeKey: "prediction:gb-target",
});
assert.equal(notificationTrustLabel(confirmed), "Confirmed Restock");
assert.equal(notificationTrustLabel(predicted), "Predicted Window");

const merged = mergeNotificationRows({
  persistedNotifications: [{ ...confirmed, readAt: "2026-05-21T13:00:00.000Z" }],
  generatedNotifications: [confirmed, confirmed, predicted],
  preferences: { confirmed_restocks: true, predicted_windows: false },
});
assert.equal(merged.length, 1, "dedupe and disabled category filtering should leave one row");
assert.equal(merged[0].readAt, "2026-05-21T13:00:00.000Z");
assert.equal(unreadNotificationCount(merged), 0);

const unread = mergeNotificationRows({
  generatedNotifications: [confirmed],
  preferences: { confirmed_restocks: true },
});
assert.equal(unreadNotificationCount(unread), 1);

const readRows = upsertNotificationState([], confirmed, { readAt: "2026-05-21T14:00:00.000Z" });
assert.equal(readRows.length, 1);
assert.equal(readRows[0].readAt, "2026-05-21T14:00:00.000Z");
assert.equal(unreadNotificationCount(readRows), 0);

const hiddenForNormal = mergeNotificationRows({
  generatedNotifications: [makeNotification({ category: "system", title: "Admin", message: "Private", adminOnly: true })],
  isAdmin: false,
});
assert.equal(hiddenForNormal.length, 0, "normal users must not receive admin-only notices");
const visibleForAdmin = mergeNotificationRows({
  generatedNotifications: [makeNotification({ category: "system", title: "Admin", message: "Private", adminOnly: true })],
  isAdmin: true,
});
assert.equal(visibleForAdmin.length, 1);

assert.ok(NOTIFICATION_PREFERENCE_ROWS.some((row) => row.key === "confirmed_restocks"));
assert.match(IN_APP_ALERT_DISCLOSURE, /In-app alerts only/i);
assert.doesNotMatch(IN_APP_ALERT_DISCLOSURE, /SMS delivery is active|push notifications enabled|email delivery is active/i);

console.log("Notification center utility tests passed.");
