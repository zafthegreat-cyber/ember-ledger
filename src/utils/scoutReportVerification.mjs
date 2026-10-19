const VERIFIED_STATUSES = new Set([
  "verified", "verified_user_report", "community_verified", "admin_verified",
  "staff_verified", "shop_verified", "admin_verified_report",
]);
const CONFIRMED_STATUSES = new Set([
  ...VERIFIED_STATUSES,
  "confirmed", "confirmed_restock", "community_confirmed", "admin_confirmed",
  "staff_confirmed", "shop_confirmed",
]);

const statusKey = (value) => String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");

// Match complete supported labels: "unverified" and "not_verified" are not verification.
export function hasVerifiedScoutReportStatus(value) {
  return VERIFIED_STATUSES.has(statusKey(value));
}

export function hasConfirmedScoutReportStatus(value) {
  return CONFIRMED_STATUSES.has(statusKey(value));
}
