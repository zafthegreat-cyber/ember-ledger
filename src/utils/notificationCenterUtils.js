import {
  dropRadarRecordKind,
  isDropRadarConfirmedTrainingEntry,
  isDropRadarPlaceholderForecast,
  isDropRadarRejectedOrDeleted,
} from "./dropRadarUtils.mjs";
import {
  normalizeCommunityGuessModerationStatus,
  normalizeEmberAssistMessageStatus,
  normalizeScoutReportModerationStatus,
} from "./adminCommandCenterUtils.js";
import {
  isLocalCommunityShop,
  normalizeStoreExpansionFields,
} from "./storeExpansionUtils.js";

export const IN_APP_ALERT_DISCLOSURE = "In-app alerts only. Push, email, and SMS delivery are not connected yet.";

export const NOTIFICATION_CATEGORIES = {
  CONFIRMED_RESTOCK: "confirmed_restock",
  PREDICTED_RESTOCK_WINDOW: "predicted_restock_window",
  COMMUNITY_GUESS_UPDATE: "community_guess_update",
  SCOUT_REPORT_STATUS: "scout_report_status",
  SAVED_PRODUCT_ALERT: "saved_product_alert",
  FAVORITE_STORE_ALERT: "favorite_store_alert",
  FAMILY_FRIENDLY_SHOP_UPDATE: "family_friendly_shop_update",
  KIDS_PROGRAM_UPDATE: "kids_program_update",
  ADMIN_MESSAGE_STATUS: "admin_message_status",
  SYSTEM_ANNOUNCEMENT: "system_announcement",
  BUSINESS_FORGE_REMINDER: "business_forge_reminder",
};

export const NOTIFICATION_CATEGORY_LABELS = {
  [NOTIFICATION_CATEGORIES.CONFIRMED_RESTOCK]: "Confirmed Restock",
  [NOTIFICATION_CATEGORIES.PREDICTED_RESTOCK_WINDOW]: "Predicted Window",
  [NOTIFICATION_CATEGORIES.COMMUNITY_GUESS_UPDATE]: "Community Guess",
  [NOTIFICATION_CATEGORIES.SCOUT_REPORT_STATUS]: "Admin Reviewed",
  [NOTIFICATION_CATEGORIES.SAVED_PRODUCT_ALERT]: "Saved Product",
  [NOTIFICATION_CATEGORIES.FAVORITE_STORE_ALERT]: "Favorite Store",
  [NOTIFICATION_CATEGORIES.FAMILY_FRIENDLY_SHOP_UPDATE]: "Family-Friendly Shop",
  [NOTIFICATION_CATEGORIES.KIDS_PROGRAM_UPDATE]: "Kids Program",
  [NOTIFICATION_CATEGORIES.ADMIN_MESSAGE_STATUS]: "Admin Message",
  [NOTIFICATION_CATEGORIES.SYSTEM_ANNOUNCEMENT]: "System Announcement",
  [NOTIFICATION_CATEGORIES.BUSINESS_FORGE_REMINDER]: "Forge Reminder",
};

export const NOTIFICATION_PREFERENCE_ROWS = [
  {
    key: "confirmed_restocks",
    category: NOTIFICATION_CATEGORIES.CONFIRMED_RESTOCK,
    label: "Confirmed restocks",
    description: "Real Scout/admin restock reports only.",
  },
  {
    key: "predicted_windows",
    category: NOTIFICATION_CATEGORIES.PREDICTED_RESTOCK_WINDOW,
    label: "Predicted windows",
    description: "Possible windows based on confirmed history, never guarantees.",
  },
  {
    key: "community_guesses",
    category: NOTIFICATION_CATEGORIES.COMMUNITY_GUESS_UPDATE,
    label: "Community guesses",
    description: "Approved or reviewed guesses, clearly labeled as not confirmed.",
  },
  {
    key: "favorite_stores",
    category: NOTIFICATION_CATEGORIES.FAVORITE_STORE_ALERT,
    label: "Favorite stores",
    description: "Confirmed updates for stores you follow.",
  },
  {
    key: "saved_products",
    category: NOTIFICATION_CATEGORIES.SAVED_PRODUCT_ALERT,
    label: "Saved products",
    description: "Confirmed reports that mention watched products.",
  },
  {
    key: "kids_program_updates",
    category: NOTIFICATION_CATEGORIES.KIDS_PROGRAM_UPDATE,
    label: "Kids Program updates",
    description: "The Spark status and family program updates.",
  },
  {
    key: "ember_assist_admin_replies",
    category: NOTIFICATION_CATEGORIES.ADMIN_MESSAGE_STATUS,
    label: "Ember Assist/admin replies",
    description: "Status changes on questions sent to Ember & Tide.",
  },
  {
    key: "business_forge_reminders",
    category: NOTIFICATION_CATEGORIES.BUSINESS_FORGE_REMINDER,
    label: "Business/Forge reminders",
    description: "Missing receipts and year-end record reminders.",
  },
  {
    key: "system_announcements",
    category: NOTIFICATION_CATEGORIES.SYSTEM_ANNOUNCEMENT,
    label: "System announcements",
    description: "What's New, maintenance, and safety updates.",
  },
];

export const DEFAULT_IN_APP_NOTIFICATION_PREFERENCES = Object.fromEntries(
  NOTIFICATION_PREFERENCE_ROWS.map((row) => [row.key, true])
);

const CATEGORY_TO_PREFERENCE_KEY = Object.fromEntries(
  NOTIFICATION_PREFERENCE_ROWS.map((row) => [row.category, row.key])
);

const PRIORITY_RANK = {
  urgent: 0,
  high: 1,
  normal: 2,
  medium: 2,
  low: 3,
};

function normalizeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function safeId(value = "") {
  return normalizeText(value).replace(/\s+/g, "-").slice(0, 96) || "notice";
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== "") || "";
}

function reportId(report = {}) {
  return firstValue(report.id, report.reportId, report.report_id, report.sourceReportId, report.source_report_id);
}

function reportStoreName(report = {}) {
  return firstValue(report.storeName, report.store_name, report.store?.name, report.store?.nickname, report.nickname, "Selected store");
}

function reportRetailer(report = {}) {
  return firstValue(report.retailer, report.chain, report.store?.retailer, report.store?.chain);
}

function reportProductName(report = {}) {
  const item = Array.isArray(report.items) ? report.items[0] : null;
  return firstValue(report.productName, report.product_name, report.itemName, report.item_name, item?.productName, item?.name, report.productCategory, "Pokemon TCG");
}

function reportTimestamp(report = {}) {
  return firstValue(report.reportedAt, report.reported_at, report.submittedAt, report.submitted_at, report.createdAt, report.created_at, report.reportDate, report.report_date);
}

function isHiddenFromNormalUsers(row = {}) {
  const visibility = normalizeText(`${row.visibility || ""} ${row.visibilityStatus || ""} ${row.status || ""}`);
  return Boolean(
    row.adminOnly ||
    row.admin_only ||
    row.internalOnly ||
    row.internal_only ||
    visibility.includes("admin only") ||
    visibility.includes("internal") ||
    visibility.includes("private admin")
  );
}

function hasDemoSignal(row = {}) {
  const text = normalizeText(`${row.id || ""} ${row.source || ""} ${row.sourceType || row.source_type || ""} ${row.notes || ""} ${row.title || ""}`);
  return text.includes("placeholder") || text.includes("fake") || text.includes("random") || text.includes("mock") || text.includes("demo forecast") || text.includes("sample forecast");
}

export function normalizeNotificationCategory(value = "") {
  const text = normalizeText(value);
  if (text.includes("confirmed") && text.includes("restock")) return NOTIFICATION_CATEGORIES.CONFIRMED_RESTOCK;
  if (text.includes("predicted") || text.includes("prediction") || text.includes("possible window")) return NOTIFICATION_CATEGORIES.PREDICTED_RESTOCK_WINDOW;
  if (text.includes("guess")) return NOTIFICATION_CATEGORIES.COMMUNITY_GUESS_UPDATE;
  if (text.includes("scout") && (text.includes("status") || text.includes("review"))) return NOTIFICATION_CATEGORIES.SCOUT_REPORT_STATUS;
  if (text.includes("saved product") || text.includes("wishlist") || text.includes("watchlist")) return NOTIFICATION_CATEGORIES.SAVED_PRODUCT_ALERT;
  if (text.includes("favorite store") || text.includes("followed store")) return NOTIFICATION_CATEGORIES.FAVORITE_STORE_ALERT;
  if (text.includes("family friendly") || text.includes("card shop") || text.includes("shop update")) return NOTIFICATION_CATEGORIES.FAMILY_FRIENDLY_SHOP_UPDATE;
  if (text.includes("kids") || text.includes("spark")) return NOTIFICATION_CATEGORIES.KIDS_PROGRAM_UPDATE;
  if (text.includes("assist") || text.includes("admin message") || text.includes("reply")) return NOTIFICATION_CATEGORIES.ADMIN_MESSAGE_STATUS;
  if (text.includes("business") || text.includes("forge") || text.includes("receipt") || text.includes("year end")) return NOTIFICATION_CATEGORIES.BUSINESS_FORGE_REMINDER;
  if (text.includes("announcement") || text.includes("maintenance") || text.includes("system") || text.includes("update") || text.includes("safety")) return NOTIFICATION_CATEGORIES.SYSTEM_ANNOUNCEMENT;
  return NOTIFICATION_CATEGORIES.SYSTEM_ANNOUNCEMENT;
}

export function notificationCategoryLabel(categoryOrNotice = "") {
  const category = typeof categoryOrNotice === "object"
    ? normalizeNotificationCategory(categoryOrNotice.category || categoryOrNotice.type || categoryOrNotice.notificationType)
    : normalizeNotificationCategory(categoryOrNotice);
  return NOTIFICATION_CATEGORY_LABELS[category] || "In-App Alert";
}

export function notificationTrustLabel(notification = {}) {
  const category = normalizeNotificationCategory(notification.category || notification.type);
  if (category === NOTIFICATION_CATEGORIES.CONFIRMED_RESTOCK) return "Confirmed Restock";
  if (category === NOTIFICATION_CATEGORIES.PREDICTED_RESTOCK_WINDOW) return "Predicted Window";
  if (category === NOTIFICATION_CATEGORIES.COMMUNITY_GUESS_UPDATE) return "Community Guess";
  if (category === NOTIFICATION_CATEGORIES.SCOUT_REPORT_STATUS || category === NOTIFICATION_CATEGORIES.ADMIN_MESSAGE_STATUS) return "Admin Reviewed";
  return notificationCategoryLabel(category);
}

export function notificationBadgeClass(notification = {}) {
  const category = normalizeNotificationCategory(notification.category || notification.type);
  return `notification-badge notification-badge--${category.replace(/_/g, "-")}`;
}

export function notificationPreferenceKey(categoryOrNotice = "") {
  const category = typeof categoryOrNotice === "object"
    ? normalizeNotificationCategory(categoryOrNotice.category || categoryOrNotice.type)
    : normalizeNotificationCategory(categoryOrNotice);
  return CATEGORY_TO_PREFERENCE_KEY[category] || "system_announcements";
}

export function normalizeNotificationPreferences(preferences = {}) {
  const normalized = { ...DEFAULT_IN_APP_NOTIFICATION_PREFERENCES };
  Object.entries(preferences || {}).forEach(([key, value]) => {
    const boolValue = typeof value === "object" && value !== null ? value.enabled !== false : value !== false;
    normalized[key] = boolValue;
  });
  if (Object.prototype.hasOwnProperty.call(preferences || {}, "stock_alerts")) {
    normalized.confirmed_restocks = preferences.stock_alerts !== false;
  }
  if (Object.prototype.hasOwnProperty.call(preferences || {}, "restock_predictions")) {
    normalized.predicted_windows = preferences.restock_predictions !== false;
  }
  if (Object.prototype.hasOwnProperty.call(preferences || {}, "wishlist_matches")) {
    normalized.saved_products = preferences.wishlist_matches !== false;
  }
  if (Object.prototype.hasOwnProperty.call(preferences || {}, "receipt_review_reminders")) {
    normalized.business_forge_reminders = preferences.receipt_review_reminders !== false;
  }
  return normalized;
}

export function notificationEnabled(preferences = {}, categoryOrNotice = "") {
  const normalized = normalizeNotificationPreferences(preferences);
  const key = notificationPreferenceKey(categoryOrNotice);
  return normalized[key] !== false;
}

export function normalizeNotificationPriority(value = "normal") {
  const text = normalizeText(value);
  if (text.includes("urgent") || text.includes("critical")) return "urgent";
  if (text.includes("high")) return "high";
  if (text.includes("low")) return "low";
  return "normal";
}

export function makeNotification(input = {}) {
  const category = normalizeNotificationCategory(input.category || input.type || input.notificationType);
  const relatedKey = firstValue(
    input.dedupeKey,
    input.relatedReportId,
    input.relatedStoreId,
    input.relatedProductId,
    input.relatedMessageId,
    input.relatedId,
    input.title
  );
  const dedupeKey = input.dedupeKey || `${category}:${safeId(relatedKey)}:${safeId(input.title || input.message || "")}`;
  return {
    id: input.id || `notice-${safeId(dedupeKey)}`,
    dedupeKey,
    userId: input.userId || input.user_id || "",
    workspaceId: input.workspaceId || input.workspace_id || "",
    category,
    type: category,
    title: String(input.title || NOTIFICATION_CATEGORY_LABELS[category] || "In-app alert").trim(),
    message: String(input.message || "").trim(),
    priority: normalizeNotificationPriority(input.priority),
    trustLabel: input.trustLabel || notificationTrustLabel({ category }),
    route: input.route || input.actionUrl || input.ctaDestination || "",
    actionLabel: input.actionLabel || input.ctaLabel || "",
    relatedStoreId: input.relatedStoreId || input.storeId || input.store_id || "",
    relatedProductId: input.relatedProductId || input.productId || input.product_id || "",
    relatedReportId: input.relatedReportId || input.reportId || input.report_id || "",
    relatedMessageId: input.relatedMessageId || input.messageId || input.message_id || "",
    createdAt: input.createdAt || input.created_at || new Date().toISOString(),
    readAt: input.readAt || input.read_at || "",
    dismissedAt: input.dismissedAt || input.dismissed_at || "",
    dismissible: input.dismissible === false ? false : true,
    source: input.source || "in_app_alerts",
    visibility: input.visibility || "private",
    adminOnly: Boolean(input.adminOnly || input.admin_only),
  };
}

export function normalizeNotificationRecord(input = {}) {
  return makeNotification({
    ...input,
    category: input.category || input.type || input.notificationType,
    route: input.route || input.actionUrl || input.ctaDestination,
    actionLabel: input.actionLabel || input.ctaLabel,
  });
}

export function buildConfirmedRestockNotification(report = {}, options = {}) {
  if (!report || isDropRadarRejectedOrDeleted(report) || hasDemoSignal(report)) return null;
  const moderationStatus = normalizeScoutReportModerationStatus(report);
  if (["Rejected", "Duplicate", "Stale"].includes(moderationStatus)) return null;
  if (!isDropRadarConfirmedTrainingEntry(report) && moderationStatus !== "Confirmed") return null;
  const storeName = reportStoreName(report);
  const productName = reportProductName(report);
  const retailer = reportRetailer(report);
  return makeNotification({
    category: NOTIFICATION_CATEGORIES.CONFIRMED_RESTOCK,
    title: `Confirmed restock reported at ${storeName}.`,
    message: `${productName}${retailer ? ` at ${retailer}` : ""}. This is a confirmed Scout/admin restock report.`,
    priority: "high",
    route: "/scout/reports",
    actionLabel: "Open Scout",
    relatedStoreId: firstValue(report.storeId, report.store_id),
    relatedReportId: reportId(report),
    relatedProductId: firstValue(report.productId, report.product_id, report.catalogProductId),
    createdAt: reportTimestamp(report) || options.now,
    dedupeKey: `confirmed-restock:${safeId(reportId(report) || `${storeName}-${productName}-${reportTimestamp(report)}`)}`,
    visibility: report.visibility || "public",
  });
}

export function buildPredictedWindowNotification(row = {}, options = {}) {
  if (!row || isDropRadarPlaceholderForecast(row) || hasDemoSignal(row) || isHiddenFromNormalUsers(row)) return null;
  const kind = row.recordKind || dropRadarRecordKind(row);
  if (kind !== "predicted_window" && row.eventType !== "Predicted Drop Window") return null;
  const storeName = firstValue(row.storeName, row.title, row.store?.name, "Watched store");
  const windowLabel = firstValue(row.windowLabel, row.timeWindow, row.timeLabel, row.nextLikelyWindow, "today");
  return makeNotification({
    category: NOTIFICATION_CATEGORIES.PREDICTED_RESTOCK_WINDOW,
    title: `Possible restock window for ${storeName}.`,
    message: `Possible window ${windowLabel}. Based on recent confirmed reports, not a guarantee.`,
    priority: row.confidenceKey === "high" || row.confidence === "high" ? "high" : "normal",
    route: "/scout/calendar",
    actionLabel: "Open Drop Radar",
    relatedStoreId: firstValue(row.storeId, row.store_id, row.store?.id),
    createdAt: options.now,
    dedupeKey: `predicted-window:${safeId(firstValue(row.id, row.storeId, storeName))}:${safeId(windowLabel)}`,
    visibility: "public",
  });
}

export function buildCommunityGuessNotification(guess = {}, options = {}) {
  if (!guess || hasDemoSignal(guess) || isHiddenFromNormalUsers(guess)) return null;
  const status = normalizeCommunityGuessModerationStatus(guess);
  if (status === "Pending") return null;
  const storeName = firstValue(guess.storeName, guess.store_name, guess.title, "Selected store");
  const title = status === "Approved as Community Guess"
    ? `Community guess approved for ${storeName}.`
    : status === "Converted to Confirmed"
      ? `Community guess was converted to confirmed for ${storeName}.`
      : `Community guess ${status.toLowerCase()} for ${storeName}.`;
  const message = status === "Approved as Community Guess"
    ? "This is still a community guess, not confirmed stock."
    : status === "Converted to Confirmed"
      ? "An admin verified this signal before it can count as confirmed restock history."
      : "This guess will not affect confirmed restock predictions.";
  return makeNotification({
    category: NOTIFICATION_CATEGORIES.COMMUNITY_GUESS_UPDATE,
    title,
    message,
    priority: status === "Converted to Confirmed" ? "high" : "normal",
    route: "/scout/calendar",
    actionLabel: "Open Drop Radar",
    relatedStoreId: firstValue(guess.storeId, guess.store_id),
    relatedReportId: firstValue(guess.id, guess.guessId, guess.guess_id),
    createdAt: firstValue(guess.adminReviewedAt, guess.updatedAt, guess.createdAt, options.now),
    dedupeKey: `community-guess:${safeId(firstValue(guess.id, guess.guessId, storeName))}:${safeId(status)}`,
    visibility: guess.visibility || "public",
  });
}

export function buildScoutReportStatusNotification(report = {}, options = {}) {
  const status = normalizeScoutReportModerationStatus(report);
  if (!["Confirmed", "Rejected", "Duplicate", "Stale"].includes(status)) return null;
  const storeName = reportStoreName(report);
  return makeNotification({
    category: NOTIFICATION_CATEGORIES.SCOUT_REPORT_STATUS,
    title: `Scout report ${status.toLowerCase()}: ${storeName}.`,
    message: status === "Confirmed"
      ? "Admin review marked this report confirmed, so it can help Drop Radar."
      : "This report will not feed Drop Radar predictions.",
    priority: status === "Confirmed" ? "normal" : "low",
    route: "/scout/reports",
    actionLabel: "Open Scout",
    relatedReportId: reportId(report),
    relatedStoreId: firstValue(report.storeId, report.store_id),
    createdAt: firstValue(report.adminReviewedAt, report.updatedAt, reportTimestamp(report), options.now),
    dedupeKey: `scout-status:${safeId(reportId(report) || storeName)}:${safeId(status)}`,
    visibility: report.visibility || "private",
    userId: report.userId || report.user_id || "",
  });
}

export function buildFavoriteStoreNotification(report = {}, stores = [], options = {}) {
  const confirmed = buildConfirmedRestockNotification(report, options);
  if (!confirmed) return null;
  const storeId = firstValue(report.storeId, report.store_id);
  const storeName = reportStoreName(report);
  const match = (stores || []).find((store) => {
    const candidateId = firstValue(store.id, store.storeId, store.store_id);
    const candidateName = firstValue(store.name, store.storeName, store.store_name, store.nickname);
    return (storeId && candidateId && String(storeId) === String(candidateId)) || normalizeText(candidateName) === normalizeText(storeName);
  });
  if (!match || !(match.favorite || match.priority || match.watchlisted || match.watchlist)) return null;
  return makeNotification({
    ...confirmed,
    category: NOTIFICATION_CATEGORIES.FAVORITE_STORE_ALERT,
    title: `Favorite store restock: ${storeName}.`,
    message: `${reportProductName(report)} was confirmed at a store you follow.`,
    dedupeKey: `favorite-store:${safeId(storeId || storeName)}:${safeId(reportId(report) || reportTimestamp(report))}`,
  });
}

export function buildSavedProductNotification(report = {}, savedProducts = [], options = {}) {
  const confirmed = buildConfirmedRestockNotification(report, options);
  if (!confirmed) return null;
  const productText = normalizeText(`${reportProductName(report)} ${report.productCategory || ""}`);
  const match = (savedProducts || []).find((item) => {
    const name = normalizeText(firstValue(item.name, item.productName, item.itemName, item.query, item.searchTerm));
    return name && (productText.includes(name) || name.includes(productText));
  });
  if (!match) return null;
  return makeNotification({
    ...confirmed,
    category: NOTIFICATION_CATEGORIES.SAVED_PRODUCT_ALERT,
    title: `Saved product spotted: ${firstValue(match.name, match.productName, match.itemName, reportProductName(report))}.`,
    message: `${reportStoreName(report)} has a confirmed report that matches your watched product.`,
    relatedProductId: firstValue(match.productId, match.catalogProductId, match.id, confirmed.relatedProductId),
    dedupeKey: `saved-product:${safeId(firstValue(match.productId, match.catalogProductId, match.name))}:${safeId(reportId(report) || reportTimestamp(report))}`,
  });
}

export function buildShopUpdateNotification(store = {}, options = {}) {
  const normalized = normalizeStoreExpansionFields(store);
  if (!isLocalCommunityShop(normalized) || normalized.active === false || isHiddenFromNormalUsers(normalized)) return null;
  if (!(normalized.familyFriendlyApproved || normalized.featuredPartner || normalized.advertisingPartner || normalized.supportsKidsAccess)) return null;
  const name = firstValue(normalized.storeName, normalized.name, normalized.nickname, "Local card shop");
  return makeNotification({
    category: NOTIFICATION_CATEGORIES.FAMILY_FRIENDLY_SHOP_UPDATE,
    title: `Shop update: ${name}.`,
    message: normalized.familyFriendlyApproved
      ? "Family-friendly status means this shop supports the Ember & Tide mission. It is not a guarantee of inventory, price, or availability."
      : "This local shop has updated community access details for review.",
    priority: normalized.featuredPartner ? "high" : "normal",
    route: "/scout/stores",
    actionLabel: "View Stores",
    relatedStoreId: firstValue(normalized.id, normalized.storeId, normalized.sourcePlaceId),
    createdAt: firstValue(normalized.updatedAt, normalized.updated_at, options.now),
    dedupeKey: `shop-update:${safeId(firstValue(normalized.id, normalized.storeName, normalized.name))}:${normalized.familyFriendlyApproved ? "approved" : "updated"}`,
    visibility: "public",
  });
}

export function buildKidsProgramNotification(application = {}, options = {}) {
  const status = normalizeText(application.status || application.programStatus || application.sparkStatus);
  if (!status || status === "not applied" || isHiddenFromNormalUsers(application)) return null;
  return makeNotification({
    category: NOTIFICATION_CATEGORIES.KIDS_PROGRAM_UPDATE,
    title: `The Spark status: ${status.replace(/\b\w/g, (char) => char.toUpperCase())}.`,
    message: "Program availability may vary. Ember & Tide will keep kid/family access fair when inventory allows.",
    priority: ["approved", "invited"].includes(status) ? "high" : "normal",
    route: "/kids-program",
    actionLabel: "Open The Spark",
    relatedMessageId: firstValue(application.id, application.applicationId),
    createdAt: firstValue(application.updatedAt, application.reviewedAt, application.createdAt, options.now),
    dedupeKey: `spark-update:${safeId(firstValue(application.id, application.email, status))}:${safeId(status)}`,
    userId: application.userId || application.user_id || "",
    visibility: "private",
  });
}

export function buildEmberAssistStatusNotification(message = {}, options = {}) {
  const status = normalizeEmberAssistMessageStatus(message);
  if (status === "New") return null;
  return makeNotification({
    category: NOTIFICATION_CATEGORIES.ADMIN_MESSAGE_STATUS,
    title: `Ember Assist message ${status.toLowerCase()}.`,
    message: status === "Resolved"
      ? "An admin marked your question resolved. Open Ember Assist or Help if you still need support."
      : "Your question sent to Ember & Tide has a new review status.",
    priority: status === "Resolved" ? "normal" : "low",
    route: firstValue(message.submittedData?.route, message.route, "/settings"),
    actionLabel: "Open Details",
    relatedMessageId: firstValue(message.id, message.messageId),
    createdAt: firstValue(message.reviewedAt, message.updatedAt, message.createdAt, options.now),
    dedupeKey: `assist-status:${safeId(firstValue(message.id, message.submittedData?.question))}:${safeId(status)}`,
    userId: message.userId || message.user_id || "",
    visibility: "private",
  });
}

export function buildBusinessReminderNotification({ expenses = [], sales = [], now = "" } = {}) {
  const missingReceipts = (expenses || []).filter((expense) => {
    const hasReceipt = Boolean(expense.receiptUrl || expense.receipt_url || expense.receiptId || expense.receipt_id || expense.receiptAttached || expense.hasReceipt);
    return !hasReceipt && Number(expense.amount || expense.total || 0) > 0;
  }).length;
  if (!missingReceipts) return null;
  return makeNotification({
    category: NOTIFICATION_CATEGORIES.BUSINESS_FORGE_REMINDER,
    title: `${missingReceipts} expense${missingReceipts === 1 ? "" : "s"} missing receipts.`,
    message: "Keep business records organized for year-end review with your tax professional.",
    priority: missingReceipts >= 5 ? "high" : "normal",
    route: "/forge/expenses",
    actionLabel: "Review Expenses",
    createdAt: now,
    dedupeKey: `business-reminder:missing-receipts:${missingReceipts}:${(sales || []).length}`,
    visibility: "private",
  });
}

export function buildNotificationsFromEvents({
  persistedNotifications = [],
  preferences = {},
  scoutReports = [],
  predictedWindows = [],
  communityGuesses = [],
  stores = [],
  savedProducts = [],
  kidsApplications = [],
  emberAssistMessages = [],
  expenses = [],
  sales = [],
  isAdmin = false,
  currentUserId = "",
  workspaceId = "",
  now = new Date().toISOString(),
} = {}) {
  const generated = [
    ...(scoutReports || []).flatMap((report) => [
      buildConfirmedRestockNotification(report, { now }),
      buildScoutReportStatusNotification(report, { now }),
      buildFavoriteStoreNotification(report, stores, { now }),
      buildSavedProductNotification(report, savedProducts, { now }),
    ]),
    ...(predictedWindows || []).map((row) => buildPredictedWindowNotification(row, { now })),
    ...(communityGuesses || []).map((guess) => buildCommunityGuessNotification(guess, { now })),
    ...(stores || []).map((store) => buildShopUpdateNotification(store, { now })),
    ...(kidsApplications || []).map((application) => buildKidsProgramNotification(application, { now })),
    ...(emberAssistMessages || []).map((message) => buildEmberAssistStatusNotification(message, { now })),
    buildBusinessReminderNotification({ expenses, sales, now }),
  ].filter(Boolean);

  return mergeNotificationRows({
    persistedNotifications,
    generatedNotifications: generated,
    preferences,
    isAdmin,
    currentUserId,
    workspaceId,
  });
}

export function mergeNotificationRows({
  persistedNotifications = [],
  generatedNotifications = [],
  preferences = {},
  isAdmin = false,
  currentUserId = "",
  workspaceId = "",
} = {}) {
  const persisted = (persistedNotifications || []).map(normalizeNotificationRecord);
  const persistedByDedupe = new Map(persisted.map((entry) => [entry.dedupeKey || entry.id, entry]));
  const merged = [];
  const seen = new Set();

  [...generatedNotifications.map(normalizeNotificationRecord), ...persisted].forEach((entry) => {
    const override = persistedByDedupe.get(entry.dedupeKey || entry.id);
    const row = override && override.id !== entry.id
      ? { ...entry, readAt: override.readAt || entry.readAt, dismissedAt: override.dismissedAt || entry.dismissedAt, id: override.id || entry.id }
      : { ...entry, ...(override || {}) };
    const key = row.dedupeKey || row.id;
    if (!key || seen.has(key)) return;
    seen.add(key);
    if (row.dismissedAt) return;
    if (!notificationEnabled(preferences, row)) return;
    if (!isAdmin && isHiddenFromNormalUsers(row)) return;
    if (!isAdmin && row.userId && currentUserId && String(row.userId) !== String(currentUserId)) return;
    if (row.workspaceId && workspaceId && String(row.workspaceId) !== String(workspaceId)) return;
    merged.push(row);
  });

  return merged.sort((a, b) => {
    const priorityDelta = (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2);
    if (priorityDelta) return priorityDelta;
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  });
}

export function unreadNotificationCount(notifications = []) {
  return (notifications || []).filter((entry) => !entry.dismissedAt && !entry.readAt).length;
}

export function upsertNotificationState(currentNotifications = [], notification = {}, updates = {}) {
  const target = normalizeNotificationRecord({ ...notification, ...updates });
  const now = new Date().toISOString();
  const next = (currentNotifications || []).map((entry) => {
    const normalized = normalizeNotificationRecord(entry);
    if (normalized.id === target.id || normalized.dedupeKey === target.dedupeKey) {
      return {
        ...entry,
        ...target,
        ...updates,
        updatedAt: now,
      };
    }
    return entry;
  });
  if (!next.some((entry) => {
    const normalized = normalizeNotificationRecord(entry);
    return normalized.id === target.id || normalized.dedupeKey === target.dedupeKey;
  })) {
    next.unshift({ ...target, ...updates, updatedAt: now });
  }
  return next.slice(0, 100);
}
