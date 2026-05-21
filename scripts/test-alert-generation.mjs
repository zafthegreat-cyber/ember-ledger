import assert from "node:assert/strict";
import {
  NOTIFICATION_CATEGORIES,
  buildCommunityGuessNotification,
  buildConfirmedRestockNotification,
  buildFavoriteStoreNotification,
  buildNotificationsFromEvents,
  buildPredictedWindowNotification,
  buildSavedProductNotification,
  buildShopUpdateNotification,
  notificationTrustLabel,
} from "../src/utils/notificationCenterUtils.js";

const confirmedReport = {
  id: "report-1",
  reportId: "report-1",
  storeId: "gb-target",
  storeName: "Greenbrier Target",
  retailer: "Target",
  productName: "Prismatic Evolutions ETB",
  productCategory: "Pokemon TCG",
  reportDate: "2026-05-21",
  reportTime: "10:30",
  stockStatus: "in_stock",
  sourceType: "user_report",
  confidence: "confirmed",
  verificationStatus: "confirmed",
  status: "confirmed",
  verified: true,
  visibility: "public",
};

const confirmedNotice = buildConfirmedRestockNotification(confirmedReport, { now: "2026-05-21T14:00:00.000Z" });
assert.equal(confirmedNotice.category, NOTIFICATION_CATEGORIES.CONFIRMED_RESTOCK);
assert.equal(notificationTrustLabel(confirmedNotice), "Confirmed Restock");
assert.match(confirmedNotice.title, /Confirmed restock reported/i);

for (const status of ["rejected", "duplicate", "stale"]) {
  const notice = buildConfirmedRestockNotification({
    ...confirmedReport,
    id: `report-${status}`,
    reportId: `report-${status}`,
    status,
    verificationStatus: status,
    moderationStatus: status,
    verified: false,
  });
  assert.equal(notice, null, `${status} reports must not create confirmed restock alerts`);
}

const predictedNotice = buildPredictedWindowNotification({
  id: "pred-1",
  recordKind: "predicted_window",
  eventType: "Predicted Drop Window",
  storeName: "Pembroke Target",
  windowLabel: "Tuesday afternoon",
  confidenceKey: "medium",
});
assert.equal(predictedNotice.category, NOTIFICATION_CATEGORIES.PREDICTED_RESTOCK_WINDOW);
assert.match(predictedNotice.message, /not a guarantee/i);
assert.equal(notificationTrustLabel(predictedNotice), "Predicted Window");

assert.equal(buildPredictedWindowNotification({
  id: "demo-forecast",
  recordKind: "predicted_window",
  sourceType: "demo forecast",
  storeName: "Demo Store",
}), null, "demo/placeholder forecast data must not create production alerts");

assert.equal(buildCommunityGuessNotification({
  id: "guess-pending",
  storeName: "Pembroke Target",
  status: "pending",
  recordKind: "community_guess",
}), null, "pending community guesses should not alert normal users");

const guessNotice = buildCommunityGuessNotification({
  id: "guess-approved",
  storeName: "Pembroke Target",
  status: "approved_community_guess",
  moderationStatus: "Approved as Community Guess",
  recordKind: "community_guess",
  visibility: "public",
});
assert.equal(guessNotice.category, NOTIFICATION_CATEGORIES.COMMUNITY_GUESS_UPDATE);
assert.match(guessNotice.message, /not confirmed stock/i);

const favoriteStoreNotice = buildFavoriteStoreNotification(confirmedReport, [
  { id: "gb-target", name: "Greenbrier Target", watchlisted: true },
]);
assert.equal(favoriteStoreNotice.category, NOTIFICATION_CATEGORIES.FAVORITE_STORE_ALERT);

const savedProductNotice = buildSavedProductNotification(confirmedReport, [
  { id: "watch-etb", name: "Prismatic Evolutions ETB" },
]);
assert.equal(savedProductNotice.category, NOTIFICATION_CATEGORIES.SAVED_PRODUCT_ALERT);

const shopNotice = buildShopUpdateNotification({
  id: "shop-1",
  name: "Family Table TCG",
  storeType: "Local Card Shop",
  familyFriendlyApproved: true,
  supportsKidsAccess: true,
  active: true,
});
assert.equal(shopNotice.category, NOTIFICATION_CATEGORIES.FAMILY_FRIENDLY_SHOP_UPDATE);
assert.match(shopNotice.message, /not a guarantee of inventory, price, or availability/i);

const rows = buildNotificationsFromEvents({
  scoutReports: [confirmedReport],
  predictedWindows: [{ id: "pred-2", recordKind: "predicted_window", storeName: "Redmill Target", windowLabel: "evening" }],
  communityGuesses: [{ id: "guess-approved", storeName: "Pembroke Target", moderationStatus: "Approved as Community Guess", visibility: "public" }],
  stores: [{ id: "shop-1", name: "Family Table TCG", storeType: "Local Card Shop", familyFriendlyApproved: true, active: true }],
  savedProducts: [{ name: "Prismatic Evolutions ETB" }],
  preferences: {
    confirmed_restocks: true,
    predicted_windows: true,
    community_guesses: true,
    family_friendly_shop_updates: true,
    saved_products: true,
  },
  now: "2026-05-21T14:00:00.000Z",
});
assert.ok(rows.some((row) => row.category === NOTIFICATION_CATEGORIES.CONFIRMED_RESTOCK));
assert.ok(rows.some((row) => row.category === NOTIFICATION_CATEGORIES.PREDICTED_RESTOCK_WINDOW));
assert.ok(rows.some((row) => row.category === NOTIFICATION_CATEGORIES.COMMUNITY_GUESS_UPDATE));
assert.ok(rows.some((row) => row.category === NOTIFICATION_CATEGORIES.FAMILY_FRIENDLY_SHOP_UPDATE));
assert.ok(rows.some((row) => row.category === NOTIFICATION_CATEGORIES.SAVED_PRODUCT_ALERT));

const suppressed = buildNotificationsFromEvents({
  scoutReports: [confirmedReport],
  preferences: { confirmed_restocks: false },
});
assert.equal(suppressed.some((row) => row.category === NOTIFICATION_CATEGORIES.CONFIRMED_RESTOCK), false);

console.log("Alert generation tests passed.");
