export const BETA_REQUEST_STATUSES = ["not_requested", "pending", "approved", "waitlist", "denied"];
export const LITTLE_SPARKS_STATUSES = ["not_applied", "pending", "approved", "waitlist", "denied"];

export const STATUS_LABELS = {
  not_requested: "Not Requested",
  not_applied: "Not Applied",
  pending: "Pending",
  approved: "Approved",
  waitlist: "Waitlist",
  waitlisted: "Waitlist",
  denied: "Denied",
  paused: "Waitlist",
  pending_review: "Pending",
  suspended: "Denied",
};

export function normalizeBetaStatus(status = "not_requested") {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "paused" || normalized === "waitlisted") return "waitlist";
  if (BETA_REQUEST_STATUSES.includes(normalized)) return normalized;
  return "not_requested";
}

export function normalizeLittleSparksStatus(status = "not_applied") {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "pending_review") return "pending";
  if (normalized === "waitlisted") return "waitlist";
  if (normalized === "suspended") return "denied";
  if (LITTLE_SPARKS_STATUSES.includes(normalized)) return normalized;
  return "not_applied";
}

export function statusLabel(status) {
  return STATUS_LABELS[String(status || "").toLowerCase()] || "Not Requested";
}

export function betaAccessStatusForProfile(profile = {}) {
  const role = String(profile.userRole || profile.user_role || "").toLowerCase();
  if (role === "admin" || role === "moderator" || profile.isAdmin) return "approved";
  return normalizeBetaStatus(
    profile.betaStatus ||
    profile.beta_status ||
    profile.betaAccessStatus ||
    profile.beta_access_status ||
    profile.status
  );
}

export function betaAccessAllowedForProfile(profile = {}) {
  return Boolean(
    profile.appAccess ||
    profile.app_access ||
    betaAccessStatusForProfile(profile) === "approved"
  );
}
