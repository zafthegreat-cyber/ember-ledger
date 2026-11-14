export function notificationMatchesFilter(entry, filter) {
  const category = String(entry.category || "");
  if (filter === "restocks") return /restock|scout_report|stock|product_alert/.test(category);
  if (filter === "stores") return /favorite_store|watched_store|store_alert/.test(category);
  if (filter === "account") return /account|security|session|admin_message|plan|membership|sync/.test(category);
  return true;
}
export function blockedNotificationHelp(agent = "") {
  if (/iphone|ipad/i.test(agent)) return "For the installed app, open iPhone Settings → Notifications → Code 3 TCG. For the website, open it from your Home Screen and check its notification permission.";
  if (/android/i.test(agent)) return "For the installed app, open Android Settings → Apps → Code 3 TCG → Notifications. In Chrome, open this site's controls → Permissions → Notifications.";
  return "Open your browser's site controls beside the address, choose Permissions or Site settings, and allow Notifications for Code 3 TCG. Also check your computer's notification settings.";
}
